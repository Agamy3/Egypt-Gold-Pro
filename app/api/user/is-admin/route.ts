/**
 * User Admin Status API
 * 
 * GET /api/user/is-admin
 */

import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/isAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await isAdmin();
    return NextResponse.json({ isAdmin: admin });
  } catch (error) {
    console.error('[API /user/is-admin] Error:', error);
    return NextResponse.json({ isAdmin: false });
  }
}

