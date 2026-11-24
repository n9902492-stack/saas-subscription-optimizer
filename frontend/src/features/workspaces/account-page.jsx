import AccountWorkspaces from './account-workspaces';

export default function AccountPage({ initialMode }) {
  return (
    <AccountWorkspaces initialMode={initialMode}>
      <aside className="team" aria-label="Renewal collaboration example">
        <h1>One renewal. Three teams.</h1>
        <p>Finance verifies spend, Engineering reviews seats, and Admin keeps the decision on track.</p>
        <ol className="team-steps">
          <li><span>F</span><div><strong>Finance</strong><small>Verified the renewal deadline</small></div></li>
          <li><span>E</span><div><strong>Engineering</strong><small>Reviewed license activity</small></div></li>
          <li><span>A</span><div><strong>Admin</strong><small>Assigned the renewal owner</small></div></li>
        </ol>
      </aside>
    </AccountWorkspaces>
  );
}

