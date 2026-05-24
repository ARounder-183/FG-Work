/*
  Warnings:

  - You are about to drop the `MusicQueue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `songQueueId` on the `SkipVote` table. All the data in the column will be lost.
  - Added the required column `songId` to the `SkipVote` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MusicQueue";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "UserSong" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songData" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "played" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSong_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SkipVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkipVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SkipVote" ("createdAt", "id", "userId") SELECT "createdAt", "id", "userId" FROM "SkipVote";
DROP TABLE "SkipVote";
ALTER TABLE "new_SkipVote" RENAME TO "SkipVote";
CREATE UNIQUE INDEX "SkipVote_userId_songId_key" ON "SkipVote"("userId", "songId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
