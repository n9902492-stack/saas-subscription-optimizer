import { ObjectId } from 'mongodb';

export function financeAccess(database) {
  const workspaces = database.collection('workspaces');
  return async (request, response, next) => {
    const id = request.params.workspaceId;
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      return response.status(404).json({ message: 'Workspace not found.' });
    }

    const workspaceId = new ObjectId(id);
    const userId = request.session.userId;
    const workspace = await workspaces.findOne(
      { _id: workspaceId, 'members.userId': userId },
      { projection: { members: { $elemMatch: { userId } } } },
    );
    if (!workspace) return response.status(404).json({ message: 'Workspace not found.' });
    if (!['Admin', 'Finance'].includes(workspace.members[0].role)) {
      return response.status(403).json({ message: 'This action requires Admin or Finance access.' });
    }

    request.workspaceId = workspaceId;
    next();
  };

}
