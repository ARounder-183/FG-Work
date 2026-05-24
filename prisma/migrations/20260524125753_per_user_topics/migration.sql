/*
  Warnings:

  - Added the required column `userId` to the `StudyTopic` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudyTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StudyTopic" ("createdAt", "icon", "id", "name") SELECT "createdAt", "icon", "id", "name" FROM "StudyTopic";
DROP TABLE "StudyTopic";
ALTER TABLE "new_StudyTopic" RENAME TO "StudyTopic";
CREATE UNIQUE INDEX "StudyTopic_userId_name_key" ON "StudyTopic"("userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
