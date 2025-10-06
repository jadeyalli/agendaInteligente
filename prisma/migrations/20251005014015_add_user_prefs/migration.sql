-- CreateTable
CREATE TABLE "UserPrefs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'ESMERALDA',
    "labelCriticaName" TEXT NOT NULL DEFAULT 'Crítica',
    "labelUrgenteName" TEXT NOT NULL DEFAULT 'Urgente',
    "labelRelevanteName" TEXT NOT NULL DEFAULT 'Relevante',
    "labelOpcionalName" TEXT NOT NULL DEFAULT 'Opcional',
    "colorCritica" TEXT NOT NULL DEFAULT '#EF4444',
    "colorUrgente" TEXT NOT NULL DEFAULT '#F59E0B',
    "colorRelevante" TEXT NOT NULL DEFAULT '#10B981',
    "colorOpcional" TEXT NOT NULL DEFAULT '#9CA3AF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPrefs_userId_key" ON "UserPrefs"("userId");
