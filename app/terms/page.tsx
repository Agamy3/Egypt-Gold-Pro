import type { Metadata } from 'next';
import TermsContent from '@/components/TermsContent';

export const metadata: Metadata = {
  title: 'Terms of Service | EgyptGold Pro',
  description: 'Terms of Service for EgyptGold Pro',
};

export default function TermsPage() {
  return <TermsContent />;
}

