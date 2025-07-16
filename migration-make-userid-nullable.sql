-- Migration: Make userId nullable in farcaster_casts table
-- This fixes the foreign key constraint error when inserting placeholder records

-- Make the userId column nullable
ALTER TABLE farcaster_casts 
MODIFY COLUMN userId INT NULL;

-- Verify the change
DESCRIBE farcaster_casts;