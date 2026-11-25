import nodemailer from 'nodemailer';

export function resetMailer(env = process.env) {
  let origin;
  try {
    const url = new URL(env.PUBLIC_APP_URL);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) throw new Error();
    origin = url.origin;
  } catch {
    return { configured: false };
  }
  const port = Number(env.SMTP_PORT || 587);
  if (!env.SMTP_HOST || !env.SMTP_FROM || !Number.isInteger(port) || port < 1 || port > 65535 ||
      Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS) || /[\r\n]/.test(env.SMTP_FROM)) return { configured: false };

  const local = ['localhost', '127.0.0.1', '::1'].includes(env.SMTP_HOST);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST, port,
    secure: env.SMTP_SECURE === 'true' || port === 465,
    requireTLS: !local,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return {
    configured: true,
    verify: () => transport.verify(),
    async send(email, token) {
      const link = `${origin}/reset-password#token=${token}`;
      const result = await transport.sendMail({
        from: env.SMTP_FROM, to: email,
        subject: 'Reset your SaaS Optimizer password',
        text: `A password reset was requested for your SaaS Optimizer account.\n\nOpen this link to choose a new password:\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.`,
      });
      if (!result.accepted?.length) throw new Error('Reset email was not accepted.');
    },
  };
}
