import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Test calling the actual business cards API
    const response = await fetch('http://localhost:3000/api/business-cards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify(body),
    });
    
    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      api_response: result,
      api_status: response.status,
      api_ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    });
  }
}
