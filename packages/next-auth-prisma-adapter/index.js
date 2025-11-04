export function PrismaAdapter(prisma) {
  return {
    async createUser(data) {
      return prisma.user.create({ data });
    },
    async getUser(id) {
      return prisma.user.findUnique({ where: { id } });
    },
    async getUserByEmail(email) {
      return prisma.user.findUnique({ where: { email } });
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true },
      });

      return account?.user ?? null;
    },
    async updateUser(user) {
      if (!user.id) {
        throw new Error('User id is required to update');
      }

      const { id, ...data } = user;

      return prisma.user.update({
        where: { id },
        data,
      });
    },
    async deleteUser(id) {
      return prisma.user.delete({ where: { id } });
    },
    async linkAccount(account) {
      return prisma.account.create({ data: account });
    },
    async unlinkAccount({ provider, providerAccountId }) {
      try {
        return await prisma.account.delete({
          where: { provider_providerAccountId: { provider, providerAccountId } },
        });
      } catch {
        return undefined;
      }
    },
    async createSession(data) {
      return prisma.session.create({ data });
    },
    async getSessionAndUser(sessionToken) {
      const sessionWithUser = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });

      if (!sessionWithUser) {
        return null;
      }

      const { user, ...session } = sessionWithUser;

      return { session, user };
    },
    async updateSession(data) {
      try {
        return await prisma.session.update({
          where: { sessionToken: data.sessionToken },
          data,
        });
      } catch {
        return null;
      }
    },
    async deleteSession(sessionToken) {
      try {
        return await prisma.session.delete({ where: { sessionToken } });
      } catch {
        return null;
      }
    },
    async createVerificationToken(data) {
      return prisma.verificationToken.create({ data });
    },
    async useVerificationToken({ identifier, token }) {
      try {
        return await prisma.verificationToken.delete({
          where: { identifier_token: { identifier, token } },
        });
      } catch {
        return null;
      }
    },
  };
}
