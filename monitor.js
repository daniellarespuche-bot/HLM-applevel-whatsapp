// monitor.js — AppLevel WhatsApp Connection Monitor
// High Living Miami
// v2 — detección precisa de estado Disconnected/Online

const https = require("https");
const http = require("http");

const CONFIG = {
  appUrl: process.env.APPLEVEL_URL,
  gmailUser: process.env.GMAIL_USER,
  gmailAppPass: process.env.GMAIL_APP_PASS,
  alertEmail: process.env.ALERT_EMAIL,
  deviceAlias: process.env.DEVICE_ALIAS || "High Living Miami — WhatsApp +1 (305) 500-1898",
};

function fetchUrl(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

async function checkConnection() {
  console.log(`[${new Date().toISOString()}] Verificando: ${CONFIG.appUrl}`);

  let appReachable = false;
  let deviceOnline = false;
  let htmlBody = "";

  try {
    const res = await fetchUrl(CONFIG.appUrl);
    appReachable = res.statusCode >= 200 && res.statusCode < 500;
    htmlBody = res.body;
    console.log(`  → App responde: HTTP ${res.statusCode}`);
  } catch (e) {
    console.log(`  → App NO responde: ${e.message}`);
    return { appReachable: false, deviceOnline: false };
  }

  if (appReachable && htmlBody) {
    // Prioridad 1: detectar explícitamente "Disconnected"
    const isDisconnected =
      /disconnected/i.test(htmlBody) ||
      /desconectado/i.test(htmlBody);

    // Prioridad 2: detectar "Online" como texto visible (entre tags HTML)
    const hasOnlineIndicator =
      />\s*Online\s*</i.test(htmlBody) ||
      /status[^>]*online/i.test(htmlBody) ||
      /"connected"\s*:\s*true/i.test(htmlBody) ||
      /badge[^>]*online/i.test(htmlBody);

    if (isDisconnected) {
      deviceOnline = false;
      console.log(`  → Estado del dispositivo: DISCONNECTED ✗`);
    } else if (hasOnlineIndicator) {
      deviceOnline = true;
      console.log(`  → Estado del dispositivo: ONLINE ✓`);
    } else {
      deviceOnline = false;
      console.log(`  → Estado no determinado — alerta por precaución`);
    }

    // Mostrar texto visible del HTML para debug
    const snippet = htmlBody
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 300);
    console.log(`  → Texto visible (fragmento): ${snippet}`);
  }

  return { appReachable, deviceOnline };
}

async function sendAlertEmail(subject) {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: CONFIG.gmailUser, pass: CONFIG.gmailAppPass },
  });

  const htmlEmail = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#1D9E75;padding:18px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">⚠️ Alerta de Conexión — High Living Miami</h2>
      </div>
      <div style="border:1px solid #ddd;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#333;"><strong>Dispositivo:</strong> ${CONFIG.deviceAlias}</p>
        <p style="font-size:15px;color:#E24B4A;"><strong>Estado detectado:</strong> DISCONNECTED</p>
        <p style="font-size:14px;color:#666;"><strong>Hora:</strong> ${new Date().toLocaleString("es-MX", { timeZone: "America/New_York" })} (EST)</p>
        <p style="font-size:14px;color:#666;"><strong>URL monitoreada:</strong> ${CONFIG.appUrl}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
        <p style="font-size:13px;color:#888;">Reconecta el dispositivo WhatsApp en AppLevel lo antes posible para no perder leads.</p>
        <a href="${CONFIG.appUrl}" style="display:inline-block;margin-top:10px;padding:10px 18px;background:#1D9E75;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;">Ir a AppLevel →</a>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Monitor High Living Miami" <${CONFIG.gmailUser}>`,
    to: CONFIG.alertEmail,
    subject,
    html: htmlEmail,
  });
}

(async () => {
  const missing = ["APPLEVEL_URL", "GMAIL_USER", "GMAIL_APP_PASS", "ALERT_EMAIL"]
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("ERROR: Variables de entorno faltantes:", missing.join(", "));
    process.exit(1);
  }

  const { appReachable, deviceOnline } = await checkConnection();

  if (!appReachable) {
    console.log("🔴 App inaccesible — enviando alerta...");
    try {
      await sendAlertEmail("🔴 ALERTA: WhatsApp High Living Miami — App inaccesible");
      console.log("✓ Alerta enviada.");
    } catch (e) {
      console.error("✗ Error enviando alerta:", e.message);
      process.exit(1);
    }
  } else if (!deviceOnline) {
    console.log("🟡 Dispositivo OFFLINE — enviando alerta...");
    try {
      await sendAlertEmail("🟡 ALERTA: WhatsApp High Living Miami — Dispositivo desconectado");
      console.log("✓ Alerta enviada.");
    } catch (e) {
      console.error("✗ Error enviando alerta:", e.message);
      process.exit(1);
    }
  } else {
    console.log("✅ Todo OK — dispositivo ONLINE. No se envía alerta.");
  }

  process.exit(0);
})();
