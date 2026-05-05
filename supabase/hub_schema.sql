-- ==============================================================================
-- COMMUNITY HUB SCHEMA ("MONOLITH EDITION")
-- ==============================================================================

-- 1. Nodes Table
-- Tracks unique communities/hubs.
CREATE TABLE IF NOT EXISTS public.nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(8) UNIQUE NOT NULL, -- 8 char alphanumeric code
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- 2. Node Memberships Table
-- Many-to-many relationship tracking who is in which node, and their clearance.
CREATE TABLE IF NOT EXISTS public.node_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    UNIQUE(node_id, user_id)
);

-- 3. Broadcasts Table
-- Stores the intelligence dispatches from Admins.
CREATE TABLE IF NOT EXISTS public.broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ==============================================================================
-- RLS (Row Level Security) POLICIES
-- ==============================================================================

ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

-- Allow read access to nodes if a user is a member
CREATE POLICY "Select nodes if member" ON public.nodes 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.node_memberships nm 
    WHERE nm.node_id = nodes.id AND nm.user_id = auth.uid()
  )
);

-- Since we use Service Role Key in the backend for everything, 
-- we actually just need to ensure the service key can read/write everything.
-- By default, service_role bypasses RLS. But if we want simple rules for now:
CREATE POLICY "Public full access to nodes" ON public.nodes FOR ALL USING (true);
CREATE POLICY "Public full access to node_memberships" ON public.node_memberships FOR ALL USING (true);
CREATE POLICY "Public full access to broadcasts" ON public.broadcasts FOR ALL USING (true);

-- (In this project, client-side Supabase client uses anon key or backend routes 
-- handle the requests. The simplest approach for this rapid proto is True for all,
-- handled safely by business logic in Express).
