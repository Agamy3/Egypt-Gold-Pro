import type { Metadata } from 'next';
import PrivacyPolicyContent from '@/components/PrivacyPolicyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy | EgyptGold Pro',
  description: 'Privacy Policy for EgyptGold Pro - Learn how we collect, use, and protect your data',
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />;
}

