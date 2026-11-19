export function workspaceRepository(database) {
  const workspaces = database.collection('workspaces');
  return {
    async create(name, userId) {
      const workspace = { name, members: [{ userId, role: 'Admin' }], createdAt: new Date() };
      const result = await workspaces.insertOne(workspace);
      return { id: result.insertedId.toString(), name, role: 'Admin' };
    },
    async list(userId) {
      const entries = await workspaces.find(
        { 'members.userId': userId },
        { projection: { name: 1, members: { $elemMatch: { userId } } } },
      ).sort({ createdAt: -1 }).toArray();
      return entries.map((workspace) => ({
        id: workspace._id.toString(), name: workspace.name, role: workspace.members[0].role,
      }));
    },
  };
}
