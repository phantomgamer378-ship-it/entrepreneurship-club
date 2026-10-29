-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "affectedCount" INTEGER,
    "notes" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "audience" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "scheduledFor" DATETIME,
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdById" TEXT,
    "updatedById" TEXT,
    "emailSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Announcement" ("audience", "body", "category", "createdAt", "createdById", "emailSentAt", "id", "pinned", "publishedAt", "scheduledFor", "slug", "status", "title", "updatedAt", "updatedById") SELECT "audience", "body", "category", "createdAt", "createdById", "emailSentAt", "id", "pinned", "publishedAt", "scheduledFor", "slug", "status", "title", "updatedAt", "updatedById" FROM "Announcement";
DROP TABLE "Announcement";
ALTER TABLE "new_Announcement" RENAME TO "Announcement";
CREATE UNIQUE INDEX "Announcement_slug_key" ON "Announcement"("slug");
CREATE INDEX "Announcement_status_publishedAt_idx" ON "Announcement"("status", "publishedAt");
CREATE INDEX "Announcement_isSeedData_idx" ON "Announcement"("isSeedData");
CREATE TABLE "new_ClubEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT NOT NULL,
    "posterUrl" TEXT,
    "gallery" TEXT,
    "venue" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "registrationDeadline" DATETIME,
    "recap" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ClubEvent" ("capacity", "createdAt", "createdById", "description", "endsAt", "featured", "gallery", "id", "isPublic", "posterUrl", "recap", "registrationDeadline", "registrationOpen", "slug", "startsAt", "status", "summary", "title", "updatedAt", "venue") SELECT "capacity", "createdAt", "createdById", "description", "endsAt", "featured", "gallery", "id", "isPublic", "posterUrl", "recap", "registrationDeadline", "registrationOpen", "slug", "startsAt", "status", "summary", "title", "updatedAt", "venue" FROM "ClubEvent";
DROP TABLE "ClubEvent";
ALTER TABLE "new_ClubEvent" RENAME TO "ClubEvent";
CREATE UNIQUE INDEX "ClubEvent_slug_key" ON "ClubEvent"("slug");
CREATE INDEX "ClubEvent_status_startsAt_idx" ON "ClubEvent"("status", "startsAt");
CREATE INDEX "ClubEvent_isSeedData_idx" ON "ClubEvent"("isSeedData");
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "clubRoleLabel" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "websiteUrl" TEXT,
    "achievements" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "interests" TEXT,
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "createdVia" TEXT NOT NULL DEFAULT 'application',
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("achievements", "avatarUrl", "bio", "clubRoleLabel", "createdAt", "displayName", "githubUrl", "id", "interests", "isPublic", "linkedinUrl", "updatedAt", "userId", "username", "websiteUrl") SELECT "achievements", "avatarUrl", "bio", "clubRoleLabel", "createdAt", "displayName", "githubUrl", "id", "interests", "isPublic", "linkedinUrl", "updatedAt", "userId", "username", "websiteUrl" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");
CREATE UNIQUE INDEX "Profile_username_key" ON "Profile"("username");
CREATE INDEX "Profile_isPublic_idx" ON "Profile"("isPublic");
CREATE INDEX "Profile_isSeedData_idx" ON "Profile"("isSeedData");
CREATE TABLE "new_VideoRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'jitsi',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "accessLevel" TEXT NOT NULL DEFAULT 'members',
    "audienceType" TEXT NOT NULL DEFAULT 'direct_invite',
    "audienceRef" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "expiresAt" DATETIME,
    "endedById" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoRoom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VideoRoom_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VideoRoom" ("accessLevel", "createdAt", "createdById", "endsAt", "expiresAt", "hostId", "id", "name", "provider", "slug", "startsAt", "status", "updatedAt") SELECT "accessLevel", "createdAt", "createdById", "endsAt", "expiresAt", "hostId", "id", "name", "provider", "slug", "startsAt", "status", "updatedAt" FROM "VideoRoom";
DROP TABLE "VideoRoom";
ALTER TABLE "new_VideoRoom" RENAME TO "VideoRoom";
CREATE UNIQUE INDEX "VideoRoom_slug_key" ON "VideoRoom"("slug");
CREATE INDEX "VideoRoom_status_startsAt_idx" ON "VideoRoom"("status", "startsAt");
CREATE INDEX "VideoRoom_audienceType_idx" ON "VideoRoom"("audienceType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AutomationRun_jobName_startedAt_idx" ON "AutomationRun"("jobName", "startedAt");

-- PRD §9: existing rooms were 'active' (instant rooms); map to the new lifecycle
UPDATE "VideoRoom" SET "status" = 'live' WHERE "status" = 'active';
