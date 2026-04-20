'use client';

import { useState } from 'react';
import { BusinessCard, AppPlatformLink } from '@/lib/supabase/business-cards';

interface BusinessCardPageProps {
  businessCard: BusinessCard;
}

export default function BusinessCardPage({ businessCard }: BusinessCardPageProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyProfileLink = () => {
    const url = window.location.href;
    copyToClipboard(url);
  };

  const getSocialIcon = (platform: string) => {
    const icons: { [key: string]: string } = {
      email: '✉️',
      phone: '📞',
      whatsapp: '💬',
      website: '🌐',
      linkedin: '💼',
      github: '💻',
      telegram: '✈️',
      twitter: '🐦',
      instagram: '📷',
      tiktok: '🎵',
      youtube: '📺',
      calendly: '📅',
    };
    return icons[platform] || '🔗';
  };

  const formatSocialUrl = (platform: string, url: string) => {
    if (!url) return '';
    
    // Remove leading/trailing whitespace
    url = url.trim();
    
    // If URL already has protocol, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Add appropriate protocol based on platform
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

  const apps = (businessCard.apps_json || []) as AppPlatformLink[];
  const skills = (businessCard.skills_json || []) as string[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header with copy link button */}
        <div className="flex justify-end mb-6">
          <button
            onClick={copyProfileLink}
            className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            {copied ? '✓ Copied!' : '📋 Copy Link'}
          </button>
        </div>

        {/* Main Business Card */}
        <div className="bg-gray-900/50 backdrop-blur-lg rounded-2xl border border-gray-800 overflow-hidden">
          {/* Banner */}
          {businessCard.banner_url && (
            <div className="h-48 bg-gradient-to-r from-gray-800 to-gray-700 relative">
              <img
                src={businessCard.banner_url}
                alt={`${businessCard.full_name} banner`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Profile Section */}
          <div className="relative px-8 pb-8">
            {/* Avatar */}
            <div className="relative -mt-16 mb-6">
              {businessCard.avatar_url ? (
                <img
                  src={businessCard.avatar_url}
                  alt={businessCard.full_name}
                  className="w-32 h-32 rounded-full border-4 border-gray-900 bg-gray-800 object-cover"
                  onError={(e) => {
                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(businessCard.full_name)}&background=374151&color=ffffff&size=128`;
                  }}
                />
              ) : (
                <div className="w-32 h-32 rounded-full border-4 border-gray-900 bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-4xl font-bold">
                  {businessCard.full_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Name and Title */}
            <div className="text-center mb-6">
              <h1 className="text-4xl font-bold text-white mb-2">
                {businessCard.full_name}
              </h1>
              {businessCard.role_title && (
                <p className="text-xl text-gray-300 mb-2">
                  {businessCard.role_title}
                </p>
              )}
              {businessCard.company_name && businessCard.show_company && (
                <p className="text-lg text-gray-400 mb-2">
                  {businessCard.company_name}
                </p>
              )}
              {businessCard.headline && (
                <p className="text-lg text-blue-400 font-medium mb-4">
                  {businessCard.headline}
                </p>
              )}
              {businessCard.location && businessCard.show_location && (
                <p className="text-gray-400 flex items-center justify-center gap-2">
                  📍 {businessCard.location}
                </p>
              )}
            </div>

            {/* Bio */}
            {businessCard.bio && (
              <div className="bg-gray-800/50 rounded-xl p-6 mb-8">
                <p className="text-gray-200 leading-relaxed text-center">
                  {businessCard.bio}
                </p>
              </div>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4 text-center">
                  Skills & Expertise
                </h3>
                <div className="flex flex-wrap justify-center gap-2">
                  {skills.map((skill, index) => (
                    <span
                      key={index}
                      className="px-4 py-2 bg-blue-600/20 border border-blue-600 text-blue-400 rounded-full text-sm font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contact & Social Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Primary Contact */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Contact</h3>
                <div className="space-y-3">
                  {businessCard.email && businessCard.show_email && (
                    <a
                      href={formatSocialUrl('email', businessCard.email)}
                      className="flex items-center gap-3 text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('email')}</span>
                      <span>{businessCard.email}</span>
                    </a>
                  )}
                  {businessCard.phone && businessCard.show_phone && (
                    <a
                      href={formatSocialUrl('phone', businessCard.phone)}
                      className="flex items-center gap-3 text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('phone')}</span>
                      <span>{businessCard.phone}</span>
                    </a>
                  )}
                  {businessCard.whatsapp && (
                    <a
                      href={formatSocialUrl('whatsapp', businessCard.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-green-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('whatsapp')}</span>
                      <span>WhatsApp</span>
                    </a>
                  )}
                  {businessCard.website_url && (
                    <a
                      href={formatSocialUrl('website', businessCard.website_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('website')}</span>
                      <span>Website</span>
                    </a>
                  )}
                  {businessCard.calendly_url && (
                    <a
                      href={formatSocialUrl('calendly', businessCard.calendly_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('calendly')}</span>
                      <span>Book a Call</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Social Media */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Find Me On</h3>
                <div className="space-y-3">
                  {businessCard.linkedin_url && (
                    <a
                      href={formatSocialUrl('linkedin', businessCard.linkedin_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('linkedin')}</span>
                      <span>LinkedIn</span>
                    </a>
                  )}
                  {businessCard.github_url && (
                    <a
                      href={formatSocialUrl('github', businessCard.github_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-gray-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('github')}</span>
                      <span>GitHub</span>
                    </a>
                  )}
                  {businessCard.telegram_url && (
                    <a
                      href={formatSocialUrl('telegram', businessCard.telegram_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('telegram')}</span>
                      <span>Telegram</span>
                    </a>
                  )}
                  {businessCard.twitter_url && (
                    <a
                      href={formatSocialUrl('twitter', businessCard.twitter_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('twitter')}</span>
                      <span>Twitter/X</span>
                    </a>
                  )}
                  {businessCard.instagram_url && (
                    <a
                      href={formatSocialUrl('instagram', businessCard.instagram_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-pink-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('instagram')}</span>
                      <span>Instagram</span>
                    </a>
                  )}
                  {businessCard.tiktok_url && (
                    <a
                      href={formatSocialUrl('tiktok', businessCard.tiktok_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-pink-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('tiktok')}</span>
                      <span>TikTok</span>
                    </a>
                  )}
                  {businessCard.youtube_url && (
                    <a
                      href={formatSocialUrl('youtube', businessCard.youtube_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <span className="text-xl">{getSocialIcon('youtube')}</span>
                      <span>YouTube</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Apps & Platforms */}
            {apps.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4 text-center">
                  Apps & Platforms
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {apps.map((app) => (
                    <a
                      key={app.id}
                      href={formatSocialUrl('website', app.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:bg-gray-800 hover:border-blue-600 transition-all text-center group"
                    >
                      <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                        {getSocialIcon(app.icon)}
                      </div>
                      <div className="text-sm text-gray-300 group-hover:text-white">
                        {app.label}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Buttons */}
            <div className="flex flex-wrap justify-center gap-4">
              {businessCard.email && businessCard.show_email && (
                <a
                  href={formatSocialUrl('email', businessCard.email)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  📧 Send Email
                </a>
              )}
              {businessCard.whatsapp && (
                <a
                  href={formatSocialUrl('whatsapp', businessCard.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  💬 WhatsApp
                </a>
              )}
              {businessCard.calendly_url && (
                <a
                  href={formatSocialUrl('calendly', businessCard.calendly_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  📅 Book a Call
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>Powered by EgyptGold Pro Business Cards</p>
        </div>
      </div>
    </div>
  );
}
