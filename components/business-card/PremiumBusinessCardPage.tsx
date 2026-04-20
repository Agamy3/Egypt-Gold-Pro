'use client';

import { useState } from 'react';
import { BusinessCard, AppPlatformLink } from '@/lib/supabase/business-cards';

interface PremiumBusinessCardPageProps {
  businessCard: BusinessCard;
}

export default function PremiumBusinessCardPage({ businessCard }: PremiumBusinessCardPageProps) {
  const [copied, setCopied] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const copyToClipboard = async (text: string, setter?: (value: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setter?.(true);
      setTimeout(() => {
        setCopied(false);
        setter?.(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyProfileLink = () => {
    const url = window.location.href;
    copyToClipboard(url);
  };

  const handleSaveContact = async () => {
    try {
      // Detect if user is on mobile device
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        // For mobile: directly open the vCard URL to trigger native contact import
        window.location.href = `/api/card/${businessCard.slug}/vcf`;
      } else {
        // For desktop: fetch and download via blob
        const response = await fetch(`/api/card/${businessCard.slug}/vcf`);
        
        if (!response.ok) {
          throw new Error('Failed to generate vCard');
        }
        
        // Get the filename from headers or use a default
        const contentDisposition = response.headers.get('content-disposition');
        const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/);
        const filename = filenameMatch?.[1] || `${businessCard.slug || businessCard.full_name.toLowerCase().replace(/\s+/g, '-')}.vcf`;
        
        // Create blob and download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
      
    } catch (error) {
      console.error('Failed to save contact:', error);
      // You could show an error message to the user here
    }
  };

  // Helper function to detect mobile and get appropriate button text
  const getSaveContactText = () => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return {
      title: 'Save Contact',
      subtitle: isMobile ? 'Add to Contacts' : 'Download vCard'
    };
  };

  const getSocialIcon = (platform: string) => {
    const icons: { [key: string]: { icon: string; color: string; gradient?: string } } = {
      email: { icon: 'Mail', color: 'text-blue-400', gradient: 'from-blue-400 to-blue-600' },
      phone: { icon: 'Phone', color: 'text-green-400', gradient: 'from-green-400 to-green-600' },
      whatsapp: { icon: 'MessageCircle', color: 'text-green-500', gradient: 'from-green-500 to-green-600' },
      website: { icon: 'Globe', color: 'text-purple-400', gradient: 'from-purple-400 to-purple-600' },
      linkedin: { icon: 'Linkedin', color: 'text-blue-500', gradient: 'from-blue-500 to-blue-700' },
      github: { icon: 'Github', color: 'text-gray-400', gradient: 'from-gray-400 to-gray-600' },
      telegram: { icon: 'Send', color: 'text-blue-400', gradient: 'from-blue-400 to-blue-600' },
      twitter: { icon: 'Twitter', color: 'text-sky-400', gradient: 'from-sky-400 to-sky-600' },
      instagram: { icon: 'Instagram', color: 'text-pink-400', gradient: 'from-pink-400 to-pink-600' },
      tiktok: { icon: 'Music', color: 'text-gray-300', gradient: 'from-gray-300 to-gray-500' },
      youtube: { icon: 'Youtube', color: 'text-red-500', gradient: 'from-red-500 to-red-700' },
      calendly: { icon: 'Calendar', color: 'text-indigo-400', gradient: 'from-indigo-400 to-indigo-600' },
      figma: { icon: 'PenTool', color: 'text-purple-500', gradient: 'from-purple-500 to-purple-700' },
      slack: { icon: 'MessageSquare', color: 'text-purple-400', gradient: 'from-purple-400 to-purple-600' },
      discord: { icon: 'Discord', color: 'text-indigo-500', gradient: 'from-indigo-500 to-indigo-700' },
      notion: { icon: 'FileText', color: 'text-gray-400', gradient: 'from-gray-400 to-gray-600' },
      medium: { icon: 'FileText', color: 'text-gray-300', gradient: 'from-gray-300 to-gray-500' },
      substack: { icon: 'FileText', color: 'text-orange-400', gradient: 'from-orange-400 to-orange-600' },
      gitlab: { icon: 'Gitlab', color: 'text-orange-500', gradient: 'from-orange-500 to-orange-700' },
      dribbble: { icon: 'Dribbble', color: 'text-pink-500', gradient: 'from-pink-500 to-pink-700' },
    };
    return icons[platform] || { icon: 'ExternalLink', color: 'text-gray-400', gradient: 'from-gray-400 to-gray-600' };
  };

  const formatSocialUrl = (platform: string, url: string) => {
    if (!url) return '';
    
    url = url.trim();
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    switch (platform) {
      case 'email':
        return `mailto:${url}`;
      case 'phone':
        return `tel:${url}`;
      case 'whatsapp':
        return `https://wa.me/${url.replace(/[^0-9]/g, '')}`;
      default:
        return `https://${url}`;
    }
  };

  const getIconComponent = (iconName: string) => {
    // Simple SVG icon components for better performance
    const icons: { [key: string]: React.ReactElement } = {
      Mail: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      Phone: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
      MessageCircle: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      Globe: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      ),
      ExternalLink: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      ),
      Calendar: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      Send: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      ),
      Linkedin: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
        </svg>
      ),
      Github: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
      Twitter: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
        </svg>
      ),
      Instagram: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.012-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1112.324 0 6.162 6.162 0 01-12.324 0zM12 16a4 4 0 110-8 4 4 0 010 8zm4.965-10.405a1.44 1.44 0 112.881.001 1.44 1.44 0 01-2.881-.001z"/>
        </svg>
      ),
      Youtube: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      Music: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      ),
      FileText: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      PenTool: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
      MessageSquare: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
      ),
      Discord: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c1.462-1.985 3.046-4.233 3.691-6.378a.077.077 0 0 0-.041-.097 13.876 13.876 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.882.074.074 0 0 1 .077-.052c.798.242 1.62.372 2.45.372.83 0 1.652-.13 2.45-.372a.074.074 0 0 1 .078.052c.12.3.24.6.371.882a.077.077 0 0 1-.006.128 13.8 13.8 0 0 1-1.873.892.077.077 0 0 0-.041.097c.646 2.145 2.229 4.393 3.692 6.378a.077.077 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      ),
      Dribbble: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.025-8.04 6.4 1.73 1.358 3.92 2.166 6.29 2.166 1.42 0 2.77-.29 4-.814zm-11.62-2.58c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.74C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.037 2.634 6.855zm-2.42-8.955c.46.008 4.683.026 9.477-1.248-1.698-3.018-3.53-5.558-3.8-5.928-2.868 1.35-5.01 3.99-5.676 7.17zM9.6 2.052c.282.38 2.145 2.914 3.822 6 3.645-1.365 5.19-3.44 5.373-3.702-1.81-1.61-4.19-2.586-6.795-2.586-.825 0-1.63.1-2.4.285zm10.335 3.483c-.218.29-1.935 2.493-5.724 4.04.24.49.47.985.68 1.486.08.18.15.36.22.53 3.41-.43 6.8.26 7.14.33-.02-2.42-.88-4.64-2.31-6.38z"/>
        </svg>
      ),
      Gitlab: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.62-5.01a.85.85 0 0 1 .8-.58h17.86a.85.85 0 0 1 .8.58l1.62 5.01a.84.84 0 0 1-.3.94zM12 19.9l7.77-5.64H4.23L12 19.9zm0-2.77L6.4 13.87h11.2L12 17.13zm0-2.77l-5.6-4.06h11.2L12 11.59z"/>
        </svg>
      ),
    };
    return icons[iconName] || icons.ExternalLink;
  };

  const apps = (businessCard.apps_json || []) as AppPlatformLink[];
  const skills = (businessCard.skills_json || []) as string[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background Pattern */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_80%,theme(colors.blue.900/0.3),transparent_50%)] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_80%_20%,theme(colors.purple.900/0.3),transparent_50%)] pointer-events-none" />
      
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        {/* Header with share action */}
        <div className="flex justify-end mb-8">
          <button
            onClick={copyProfileLink}
            className="group relative px-6 py-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-300 flex items-center gap-3 text-white/80 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.032-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 3.12-9.032 7.326m0 0A9.001 9.001 0 0012 21c4.474 0 8.268-3.12 9.032-7.326" />
            </svg>
            <span className="font-medium">{copied ? 'Link Copied!' : 'Share Profile'}</span>
            {copied && (
              <div className="absolute -top-8 right-0 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm">
                Copied!
              </div>
            )}
          </button>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          {/* Left Column - Profile */}
          <div className="lg:col-span-1">
            <div className="relative">
              {/* Banner */}
              {businessCard.banner_url ? (
                <div className="relative h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-700">
                  <img
                    src={businessCard.banner_url}
                    alt={`${businessCard.full_name} banner`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
              ) : (
                <div className="h-48 rounded-2xl bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 backdrop-blur-sm border border-white/5" />
              )}

              {/* Avatar */}
              <div className="relative -mt-16 mb-6 text-center">
                <div className="inline-block relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full blur-xl opacity-50" />
                  {businessCard.avatar_url ? (
                    <img
                      src={businessCard.avatar_url}
                      alt={businessCard.full_name}
                      className="relative w-32 h-32 rounded-full border-4 border-slate-900 bg-slate-800 object-cover shadow-2xl"
                      onError={(e) => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(businessCard.full_name)}&background=1e293b&color=ffffff&size=128`;
                      }}
                    />
                  ) : (
                    <div className="relative w-32 h-32 rounded-full border-4 border-slate-900 bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-2xl">
                      {businessCard.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Status indicator */}
                  <div className="absolute bottom-2 right-2 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900" />
                </div>
              </div>

              {/* Profile Info */}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                  {businessCard.full_name}
                </h1>
                {businessCard.role_title && (
                  <p className="text-lg text-white/70 font-medium mb-2">
                    {businessCard.role_title}
                  </p>
                )}
                {businessCard.company_name && businessCard.show_company && (
                  <p className="text-base text-white/60 mb-3">
                    {businessCard.company_name}
                  </p>
                )}
                {businessCard.headline && (
                  <p className="text-base text-blue-400 font-medium mb-4 leading-relaxed">
                    {businessCard.headline}
                  </p>
                )}
                {businessCard.location && businessCard.show_location && (
                  <div className="flex items-center justify-center gap-2 text-white/60">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{businessCard.location}</span>
                  </div>
                )}
              </div>

              {/* Bio */}
              {businessCard.bio && (
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-8">
                  <p className="text-white/80 leading-relaxed text-center">
                    {businessCard.bio}
                  </p>
                </div>
              )}

              {/* Skills */}
              {skills.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-white mb-4 text-center">Skills & Expertise</h3>
                  <div className="flex flex-wrap justify-center gap-2">
                    {skills.map((skill, index) => (
                      <span
                        key={index}
                        className="px-4 py-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-400 rounded-full text-sm font-medium backdrop-blur-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Contact & Actions */}
          <div className="lg:col-span-2 space-y-8">
            {/* Primary Contact Actions */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
              <h2 className="text-xl font-semibold text-white mb-6">Get in Touch</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {businessCard.email && businessCard.show_email && (
                  <a
                    href={formatSocialUrl('email', businessCard.email)}
                    className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-4 hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      {getIconComponent('Mail')}
                      <div className="flex-1">
                        <div className="font-medium">Email</div>
                        <div className="text-sm opacity-90 truncate">{businessCard.email}</div>
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </a>
                )}
                {businessCard.phone && businessCard.show_phone && (
                  <a
                    href={formatSocialUrl('phone', businessCard.phone)}
                    className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl p-4 hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300"
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      {getIconComponent('Phone')}
                      <div className="flex-1">
                        <div className="font-medium">Phone</div>
                        <div className="text-sm opacity-90">{businessCard.phone}</div>
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-green-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </a>
                )}
                {businessCard.whatsapp && (
                  <a
                    href={formatSocialUrl('whatsapp', businessCard.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl p-4 hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300"
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      {getIconComponent('MessageCircle')}
                      <div className="flex-1">
                        <div className="font-medium">WhatsApp</div>
                        <div className="text-sm opacity-90">Chat on WhatsApp</div>
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </a>
                )}
                {businessCard.calendly_url && (
                  <a
                    href={formatSocialUrl('calendly', businessCard.calendly_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl p-4 hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300"
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      {getIconComponent('Calendar')}
                      <div className="flex-1">
                        <div className="font-medium">Schedule</div>
                        <div className="text-sm opacity-90">Book a Meeting</div>
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </a>
                )}
                
                {/* Save Contact Button */}
                <button
                  onClick={handleSaveContact}
                  className="group relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl p-4 hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300"
                >
                  <div className="relative z-10 flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <div className="flex-1 text-left">
                      <div className="font-medium">{getSaveContactText().title}</div>
                      <div className="text-sm opacity-90">{getSaveContactText().subtitle}</div>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>
              </div>
            </div>

            {/* Social Links */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
              <h2 className="text-xl font-semibold text-white mb-6">Connect</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {businessCard.website_url && (
                  <a
                    href={formatSocialUrl('website', businessCard.website_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                  >
                    <div className={`w-8 h-8 mx-auto mb-2 ${getSocialIcon('website').color}`}>
                      {getIconComponent('Globe')}
                    </div>
                    <div className="text-sm text-white/80 group-hover:text-white">Website</div>
                  </a>
                )}
                {businessCard.linkedin_url && (
                  <a
                    href={formatSocialUrl('linkedin', businessCard.linkedin_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                  >
                    <div className={`w-8 h-8 mx-auto mb-2 ${getSocialIcon('linkedin').color}`}>
                      {getIconComponent('Linkedin')}
                    </div>
                    <div className="text-sm text-white/80 group-hover:text-white">LinkedIn</div>
                  </a>
                )}
                {businessCard.github_url && (
                  <a
                    href={formatSocialUrl('github', businessCard.github_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                  >
                    <div className={`w-8 h-8 mx-auto mb-2 ${getSocialIcon('github').color}`}>
                      {getIconComponent('Github')}
                    </div>
                    <div className="text-sm text-white/80 group-hover:text-white">GitHub</div>
                  </a>
                )}
                {businessCard.telegram_url && (
                  <a
                    href={formatSocialUrl('telegram', businessCard.telegram_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                  >
                    <div className={`w-8 h-8 mx-auto mb-2 ${getSocialIcon('telegram').color}`}>
                      {getIconComponent('Send')}
                    </div>
                    <div className="text-sm text-white/80 group-hover:text-white">Telegram</div>
                  </a>
                )}
                {businessCard.twitter_url && (
                  <a
                    href={formatSocialUrl('twitter', businessCard.twitter_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                  >
                    <div className={`w-8 h-8 mx-auto mb-2 ${getSocialIcon('twitter').color}`}>
                      {getIconComponent('Twitter')}
                    </div>
                    <div className="text-sm text-white/80 group-hover:text-white">Twitter</div>
                  </a>
                )}
                {businessCard.instagram_url && (
                  <a
                    href={formatSocialUrl('instagram', businessCard.instagram_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                  >
                    <div className={`w-8 h-8 mx-auto mb-2 ${getSocialIcon('instagram').color}`}>
                      {getIconComponent('Instagram')}
                    </div>
                    <div className="text-sm text-white/80 group-hover:text-white">Instagram</div>
                  </a>
                )}
                {businessCard.tiktok_url && (
                  <a
                    href={formatSocialUrl('tiktok', businessCard.tiktok_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                  >
                    <div className={`w-8 h-8 mx-auto mb-2 ${getSocialIcon('tiktok').color}`}>
                      {getIconComponent('Music')}
                    </div>
                    <div className="text-sm text-white/80 group-hover:text-white">TikTok</div>
                  </a>
                )}
                {businessCard.youtube_url && (
                  <a
                    href={formatSocialUrl('youtube', businessCard.youtube_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                  >
                    <div className={`w-8 h-8 mx-auto mb-2 ${getSocialIcon('youtube').color}`}>
                      {getIconComponent('Youtube')}
                    </div>
                    <div className="text-sm text-white/80 group-hover:text-white">YouTube</div>
                  </a>
                )}
              </div>
            </div>

            {/* Apps & Platforms */}
            {apps.length > 0 && (
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
                <h2 className="text-xl font-semibold text-white mb-6">Apps & Platforms</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {apps.map((app) => (
                    <a
                      key={app.id}
                      href={formatSocialUrl('website', app.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 text-center"
                    >
                      <div className="w-8 h-8 mx-auto mb-2 text-white/60 group-hover:text-white">
                        {getIconComponent(app.icon) || getIconComponent('ExternalLink')}
                      </div>
                      <div className="text-sm text-white/80 group-hover:text-white truncate">
                        {app.label}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-white/40 text-sm">
          <p>Powered by EgyptGold Pro Business Cards</p>
        </div>
      </div>
    </div>
  );
}
