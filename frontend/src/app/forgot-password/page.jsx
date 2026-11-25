import PasswordRecovery from '../../features/workspaces/password-recovery';

export const metadata = { title: 'Forgot password | SaaS Optimizer', referrer: 'no-referrer', robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <PasswordRecovery />;
}
