-- CreateTable
CREATE TABLE "TokenCheck" (
    "key" TEXT NOT NULL,
    "cgId" TEXT,
    "isMeme" BOOLEAN,
    "categories" TEXT[],
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenCheck_pkey" PRIMARY KEY ("key")
);
