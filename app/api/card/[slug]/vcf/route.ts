import { NextRequest, NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getBusinessCardBySlug } from '@/lib/supabase/business-cards';

interface Params {
  params: {
    slug: string;
  };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const businessCard = await getBusinessCardBySlug(params.slug);
    
    if (!businessCard || !businessCard.is_public) {
      return notFound();
    }

    // Generate vCard content
    const vCardContent = generateVCard(businessCard);
    
    // Set headers for file download
    const filename = `${businessCard.slug || businessCard.full_name.toLowerCase().replace(/\s+/g, '-')}.vcf`;
    
    return new NextResponse(vCardContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('vCard generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate vCard' },
      { status: 500 }
    );
  }
}

function generateVCard(card: any): string {
  const lines: string[] = [];
  
  // vCard header
  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');
  lines.push('PRODID:-//EgyptGold Pro//Business Cards//EN');
  
  // Full Name (required)
  if (card.full_name) {
    lines.push(`FN:${escapeVCardField(card.full_name)}`);
    lines.push(`N:${escapeVCardField(card.full_name)};;;;`);
  }
  
  // Organization/Company
  if (card.company_name && card.show_company) {
    lines.push(`ORG:${escapeVCardField(card.company_name)}`);
  }
  
  // Title/Role
  if (card.role_title) {
    lines.push(`TITLE:${escapeVCardField(card.role_title)}`);
  }
  
  // Email
  if (card.email && card.show_email) {
    lines.push(`EMAIL;TYPE=INTERNET;TYPE=WORK:${escapeVCardField(card.email)}`);
  }
  
  // Phone
  if (card.phone && card.show_phone) {
    lines.push(`TEL;TYPE=WORK,VOICE:${escapeVCardField(card.phone)}`);
  }
  
  // WhatsApp (as separate phone type)
  if (card.whatsapp) {
    lines.push(`TEL;TYPE=WORK,VOICE:${escapeVCardField(card.whatsapp)}`);
    lines.push('X-WHATSAPP:YES');
  }
  
  // Website
  if (card.website_url) {
    lines.push(`URL:${escapeVCardField(card.website_url)}`);
  }
  
  // Location/Address
  if (card.location && card.show_location) {
    // Simple address format - just location as a single line
    lines.push(`ADR;TYPE=WORK:;;${escapeVCardField(card.location)};;;;`);
  }
  
  // LinkedIn
  if (card.linkedin_url) {
    lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${escapeVCardField(card.linkedin_url)}`);
  }
  
  // GitHub
  if (card.github_url) {
    lines.push(`X-SOCIALPROFILE;TYPE=github:${escapeVCardField(card.github_url)}`);
  }
  
  // Bio/Notes
  if (card.bio) {
    lines.push(`NOTE:${escapeVCardField(card.bio)}`);
  }
  
  // Creation and modification dates
  if (card.created_at) {
    lines.push(`REV:${new Date(card.created_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}Z`);
  }
  
  // vCard footer
  lines.push('END:VCARD');
  
  return lines.join('\r\n');
}

function escapeVCardField(field: string): string {
  if (!field) return '';
  
  return field
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/,/g, '\\,')    // Escape commas
    .replace(/;/g, '\\;')    // Escape semicolons
    .replace(/\n/g, '\\n')   // Escape newlines
    .replace(/\r/g, '\\r')   // Escape carriage returns
    .trim();
}
