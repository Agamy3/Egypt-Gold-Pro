import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PremiumBusinessCardPage from '@/components/business-card/PremiumBusinessCardPage';
import { getBusinessCardBySlug } from '@/lib/supabase/business-cards';

interface BusinessCardPageProps {
  params: {
    slug: string;
  };
}

export async function generateMetadata(
  { params }: BusinessCardPageProps
): Promise<Metadata> {
  const businessCard = await getBusinessCardBySlug(params.slug);
  
  if (!businessCard) {
    return {
      title: 'Business Card Not Found',
      description: 'The requested business card could not be found.',
    };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';
  const cardUrl = `${siteUrl}/card/${businessCard.slug}`;
  
  return {
    title: `${businessCard.full_name} - ${businessCard.role_title || 'Business Card'}`,
    description: businessCard.headline || businessCard.bio || `Connect with ${businessCard.full_name}`,
    metadataBase: new URL(siteUrl),
    openGraph: {
      title: `${businessCard.full_name} - ${businessCard.role_title || 'Business Card'}`,
      description: businessCard.headline || businessCard.bio || `Connect with ${businessCard.full_name}`,
      url: cardUrl,
      siteName: 'EgyptGold Pro',
      images: businessCard.avatar_url ? [
        {
          url: businessCard.avatar_url,
          width: 400,
          height: 400,
          alt: `${businessCard.full_name} - Profile`,
        }
      ] : [],
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${businessCard.full_name} - ${businessCard.role_title || 'Business Card'}`,
      description: businessCard.headline || businessCard.bio || `Connect with ${businessCard.full_name}`,
      images: businessCard.avatar_url ? [businessCard.avatar_url] : [],
    },
    robots: businessCard.noindex ? {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    } : {
      index: true,
      follow: true,
    },
  };
}

export default async function BusinessCardRoute({ params }: BusinessCardPageProps) {
  const businessCard = await getBusinessCardBySlug(params.slug);
  
  if (!businessCard) {
    notFound();
  }

  return <PremiumBusinessCardPage businessCard={businessCard} />;
}
