// monitor.js — AppLevel WhatsApp Connection Monitor
// High Living Miami
// Corre en GitHub Actions: verifica que el dispositivo esté ONLINE
// y envía alerta por Gmail si no lo está.

const https = require("https");
const http = require("http");

// ─── Configuración (se inyecta desde GitHub Secrets) ───────────────────────
const CONFIG = {
  appUrl: process.env.APPLEVEL_URL,          // URL de tu app AppLevel
  gmailUser: process.env.GMAIL_USER,         // tu-correo@gmail.com
  gmailAppPass: process.env.GMAIL_APP_PASS,  // contraseña de aplicación Gmail
  alertEmail: process.env.ALERT_EMAIL,       // correo que recibe la alerta
  deviceAlias: process.env.DEVICE_ALIAS || "High Living Miami — WhatsApp +1 (305) 500-1898",
};

// ─── Función: fetch con timeout ─────────────────────────────────────────────
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

// ─── Función: verificar estado ──────────────────────────────────────────────
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
    appReachable = false;
  }

  if (appReachable && htmlBody) {
    // Buscar indicadores de "Online" en el HTML de AppLevel
    const onlinePatterns = [
      /online/i,
      /conectado/i,
      /connected/i,
      /"status"\s*:\s*"online"/i,
      /class="[^"]*online[^"]*"/i,
    ];
    deviceOnline = onlinePatterns.some((p) => p.test(htmlBody));
    console.log(`  → Estado del dispositivo: ${deviceOnline ? "ONLINE ✓" : "NO detectado como ONLINE"}`);
  }

  return { appReachable, deviceOnline, htmlBody: htmlBody.substring(0, 500) };
}

// ─── Función: enviar email por Gmail SMTP (sin dependencias) ─────────────────
function sendAlertEmail(subject, bodyText) {
  return new Promise((resolve, reject) => {
    // Usamos el módulo nodemailer — disponible en el runner de GitHub Actions
    // Si no está instalado, el workflow lo instala antes de correr este script
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: CONFIG.gmailUser,
          pass: CONFIG.gmailAppPass,
        },
      });

      const htmlEmail = `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
          <div style="background:#1D9E75;padding:18px 24px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:18px;">⚠️ Alerta de Conexión — High Living Miami</h2>
          </div>
          <div style="border:1px solid #ddd;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px;">
            <p style="font-size:15px;color:#333;"><strong>Dispositivo:</strong> ${CONFIG.deviceAlias}</p>
            <p style="font-size:15px;color:#E24B4A;"><strong>Estado detectado:</strong> OFFLINE / Sin respuesta</p>
            <p style="font-size:14px;color:#666;"><strong>Hora de detección:</strong> ${new Date().toLocaleString("es-MX", { timeZone: "America/New_York" })} (EST)</p>
            <p style="font-size:14px;color:#666;"><strong>URL monitoreada:</strong> ${CONFIG.appUrl}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
            <p style="font-size:13px;color:#888;">Verifica la conexión en AppLevel y reconecta el dispositivo WhatsApp si es necesario.</p>
            <a href="${CONFIG.appUrl}" style="display:inline-block;margin-top:10px;padding:10px 18px;background:#1D9E75;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;">Ir a AppLevel →</a>
          </div>
          <p style="font-size:11px;color:#aaa;text-align:center;margin-top:12px;">Monitor automático · High Living Miami</p>
        </div>
      `;

      transporter.sendMail({
        from: `"Monitor High Living Miami" <${CONFIG.gmailUser}>`,
        to: CONFIG.alertEmail,
        subject,
        html: htmlEmail,
      }, (err, info) => {
        if (err) { reject(err); } else { resolve(info); }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  // Validar configuración
  const missing = ["APPLEVEL_URL","GMAIL_USER","GMAIL_APP_PASS","ALERT_EMAIL"]
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("ERROR: Variables de entorno faltantes:", missing.join(", "));
    process.exit(1);
  }

  const { appReachable, deviceOnline } = await checkConnection();

  if (!appReachable) {
    console.log("🔴 App inaccesible — enviando alerta...");
    try {
      await sendAlertEmail(
        "🔴 ALERTA: WhatsApp High Living Miami — App inaccesible",
        "La app de AppLevel no responde."
      );
      console.log("✓ Alerta enviada.");
    } catch (e) {
      console.error("✗ Error enviando alerta:", e.message);
      process.exit(1);
    }
  } else if (!deviceOnline) {
    console.log("🟡 App accesible pero dispositivo no detectado como ONLINE — enviando alerta...");
    try {
      await sendAlertEmail(
        "🟡 ALERTA: WhatsApp High Living Miami — Dispositivo posiblemente desconectado",
        "La app responde pero el dispositivo no aparece como ONLINE."
      );
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
