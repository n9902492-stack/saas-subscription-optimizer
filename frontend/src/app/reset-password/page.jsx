import PasswordRecovery from '../../features/workspaces/password-recovery';

export const metadata = { title: 'Reset password | SaaS Optimizer', referrer: 'no-referrer', robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return <PasswordRecovery reset />;
}
