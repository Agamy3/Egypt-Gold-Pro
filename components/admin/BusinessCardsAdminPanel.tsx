'use client';

import { useState, useEffect } from 'react';
import { BusinessCard, AppPlatformLink } from '@/lib/supabase/business-cards';
import IconPicker from '@/components/business-card/IconPicker';

interface BusinessCardsAdminPanelProps {
  userId: string;
}

export default function BusinessCardsAdminPanel({ userId }: BusinessCardsAdminPanelProps) {
  const [businessCard, setBusinessCard] = useState<BusinessCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    slug: '',
    is_public: true,
    full_name: '',
    role_title: '',
    headline: '',
    bio: '',
    avatar_url: '',
    banner_url: '',
    company_name: '',
    email: '',
    phone: '',
    whatsapp: '',
    location: '',
    website_url: '',
    linkedin_url: '',
    github_url: '',
    telegram_url: '',
    twitter_url: '',
    instagram_url: '',
    tiktok_url: '',
    youtube_url: '',
    calendly_url: '',
    apps: [] as AppPlatformLink[],
    skills: [] as string[],
    theme_color: '#000000',
    show_email: true,
    show_phone: true,
    show_location: true,
    show_company: true,
    noindex: false,
  });

  const [newApp, setNewApp] = useState({ label: '', url: '', icon: 'globe' });
  const [newSkill, setNewSkill] = useState('');

  useEffect(() => {
    loadBusinessCard();
  }, [userId]);

  const loadBusinessCard = async () => {
    try {
      const response = await fetch('/api/business-cards');
      if (response.ok) {
        const result = await response.json();
        const card = result.data;
        if (card) {
          setBusinessCard(card);
          setFormData({
            slug: card.slug,
            is_public: card.is_public,
            full_name: card.full_name,
            role_title: card.role_title || '',
            headline: card.headline || '',
            bio: card.bio || '',
            avatar_url: card.avatar_url || '',
            banner_url: card.banner_url || '',
            company_name: card.company_name || '',
            email: card.email || '',
            phone: card.phone || '',
            whatsapp: card.whatsapp || '',
            location: card.location || '',
            website_url: card.website_url || '',
            linkedin_url: card.linkedin_url || '',
            github_url: card.github_url || '',
            telegram_url: card.telegram_url || '',
            twitter_url: card.twitter_url || '',
            instagram_url: card.instagram_url || '',
            tiktok_url: card.tiktok_url || '',
            youtube_url: card.youtube_url || '',
            calendly_url: card.calendly_url || '',
            apps: card.apps_json || [],
            skills: card.skills_json || [],
            theme_color: card.theme_color || '#000000',
            show_email: card.show_email,
            show_phone: card.show_phone,
            show_location: card.show_location,
            show_company: card.show_company,
            noindex: card.noindex,
          });
        }
      }
    } catch (error) {
      console.error('Error loading business card:', error);
      setMessage({ type: 'error', text: 'Failed to load business card' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const cardData = {
        ...formData,
        apps: formData.apps,
        skills: formData.skills,
      };

      const method = businessCard ? 'PUT' : 'POST';
      const response = await fetch('/api/business-cards', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cardData),
      });

      const result = await response.json();

      if (result.success) {
        setBusinessCard(result.data);
        setMessage({ type: 'success', text: 'Business card saved successfully!' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save business card' });
      }
    } catch (error) {
      console.error('Error saving business card:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving' });
    } finally {
      setSaving(false);
    }
  };

  const addApp = () => {
    if (newApp.label && newApp.url) {
      setFormData(prev => ({
        ...prev,
        apps: [...prev.apps, { ...newApp, id: Date.now().toString() }]
      }));
      setNewApp({ label: '', url: '', icon: 'globe' });
    }
  };

  const removeApp = (appId: string) => {
    setFormData(prev => ({
      ...prev,
      apps: prev.apps.filter(app => app.id !== appId)
    }));
  };

  const addSkill = () => {
    if (newSkill.trim()) {
      setFormData(prev => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()]
      }));
      setNewSkill('');
    }
  };

  const removeSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skill)
    }));
  };

  const copyPublicLink = () => {
    if (businessCard?.slug) {
      const url = `${window.location.origin}/card/${businessCard.slug}`;
      navigator.clipboard.writeText(url);
      setMessage({ type: 'success', text: 'Public link copied to clipboard!' });
    }
  };

  const openPublicPage = () => {
    if (businessCard?.slug) {
      window.open(`/card/${businessCard.slug}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center text-gray-400">Loading...</div>
      </div>
    );
  }

  if (previewMode) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Preview Mode</h2>
          <button
            onClick={() => setPreviewMode(false)}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Back to Edit
          </button>
        </div>
        
        <div className="bg-gray-900 rounded-xl p-8">
          <div className="text-center">
            {formData.avatar_url && (
              <img
                src={formData.avatar_url}
                alt={formData.full_name}
                className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
              />
            )}
            <h1 className="text-3xl font-bold text-white mb-2">{formData.full_name}</h1>
            {formData.role_title && (
              <p className="text-xl text-gray-300 mb-2">{formData.role_title}</p>
            )}
            {formData.headline && (
              <p className="text-lg text-gray-400 mb-4">{formData.headline}</p>
            )}
            {formData.bio && (
              <p className="text-gray-300 mb-6 max-w-2xl mx-auto">{formData.bio}</p>
            )}
            
            <div className="flex flex-wrap justify-center gap-3 mb-6">
              {formData.skills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
            
            <div className="flex flex-wrap justify-center gap-4 mb-6">
              {formData.email && formData.show_email && (
                <a href={`mailto:${formData.email}`} className="text-blue-400 hover:text-blue-300">
                  Email
                </a>
              )}
              {formData.phone && formData.show_phone && (
                <a href={`tel:${formData.phone}`} className="text-blue-400 hover:text-blue-300">
                  Phone
                </a>
              )}
              {formData.website_url && (
                <a href={formData.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                  Website
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">
          {businessCard ? 'Edit Business Card' : 'Create Business Card'}
        </h2>
        <div className="flex gap-3">
          {businessCard && (
            <>
              <button
                onClick={copyPublicLink}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Copy Link
              </button>
              <button
                onClick={openPublicPage}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                View Public
              </button>
            </>
          )}
          <button
            onClick={() => setPreviewMode(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Preview
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Information */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Basic Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Role/Title
              </label>
              <input
                type="text"
                value={formData.role_title}
                onChange={(e) => setFormData(prev => ({ ...prev, role_title: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Headline
              </label>
              <input
                type="text"
                value={formData.headline}
                onChange={(e) => setFormData(prev => ({ ...prev, headline: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Bio
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* URLs and Images */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Images & URLs</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Avatar URL
              </label>
              <input
                type="url"
                value={formData.avatar_url}
                onChange={(e) => setFormData(prev => ({ ...prev, avatar_url: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Banner URL
              </label>
              <input
                type="url"
                value={formData.banner_url}
                onChange={(e) => setFormData(prev => ({ ...prev, banner_url: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Website URL
              </label>
              <input
                type="url"
                value={formData.website_url}
                onChange={(e) => setFormData(prev => ({ ...prev, website_url: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Custom Slug
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="Leave empty to auto-generate"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Contact Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                WhatsApp
              </label>
              <input
                type="tel"
                value={formData.whatsapp}
                onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Location
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Social Links */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Social Links</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                LinkedIn
              </label>
              <input
                type="url"
                value={formData.linkedin_url}
                onChange={(e) => setFormData(prev => ({ ...prev, linkedin_url: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                GitHub
              </label>
              <input
                type="url"
                value={formData.github_url}
                onChange={(e) => setFormData(prev => ({ ...prev, github_url: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Telegram
              </label>
              <input
                type="url"
                value={formData.telegram_url}
                onChange={(e) => setFormData(prev => ({ ...prev, telegram_url: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Twitter/X
              </label>
              <input
                type="url"
                value={formData.twitter_url}
                onChange={(e) => setFormData(prev => ({ ...prev, twitter_url: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Apps & Platforms */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Apps & Platforms</h3>
          
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Label
                </label>
                <input
                  type="text"
                  value={newApp.label}
                  onChange={(e) => setNewApp(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., My Portfolio"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  URL
                </label>
                <input
                  type="url"
                  value={newApp.url}
                  onChange={(e) => setNewApp(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Icon
                </label>
                <IconPicker
                  selectedIcon={newApp.icon}
                  onIconChange={(icon) => setNewApp(prev => ({ ...prev, icon }))}
                />
              </div>
            </div>
            
            <button
              onClick={addApp}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Platform
            </button>
          </div>
          
          <div className="space-y-2">
            {formData.apps.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {(() => {
                      const iconOptions = [
                        { value: 'globe', emoji: '🌐' },
                        { value: 'email', emoji: '✉️' },
                        { value: 'phone', emoji: '📞' },
                        { value: 'whatsapp', emoji: '💬' },
                        { value: 'linkedin', emoji: '💼' },
                        { value: 'github', emoji: '💻' },
                        { value: 'telegram', emoji: '✈️' },
                        { value: 'twitter', emoji: '🐦' },
                        { value: 'instagram', emoji: '📷' },
                        { value: 'tiktok', emoji: '🎵' },
                        { value: 'youtube', emoji: '📺' },
                        { value: 'calendly', emoji: '📅' },
                        { value: 'figma', emoji: '🎨' },
                        { value: 'slack', emoji: '💬' },
                        { value: 'discord', emoji: '🎮' },
                        { value: 'notion', emoji: '📝' },
                        { value: 'medium', emoji: '📖' },
                        { value: 'substack', emoji: '📰' },
                        { value: 'gitlab', emoji: '🦊' },
                        { value: 'dribbble', emoji: '🏀' },
                        { value: 'behance', emoji: '🎯' },
                        { value: 'codepen', emoji: '⚡' },
                        { value: 'stackoverflow', emoji: '📚' },
                        { value: 'reddit', emoji: '🤖' },
                        { value: 'pinterest', emoji: '📌' },
                        { value: 'snapchat', emoji: '👻' },
                        { value: 'spotify', emoji: '🎵' },
                        { value: 'apple', emoji: '🍎' },
                        { value: 'google', emoji: '🔍' },
                        { value: 'microsoft', emoji: '🪟' },
                        { value: 'amazon', emoji: '📦' },
                        { value: 'shopify', emoji: '🛒' },
                        { value: 'paypal', emoji: '💳' },
                        { value: 'stripe', emoji: '🔵' },
                        { value: 'coinbase', emoji: '₿' },
                        { value: 'binance', emoji: '🪙' },
                        { value: 'link', emoji: '🔗' },
                        { value: 'star', emoji: '⭐' },
                        { value: 'heart', emoji: '❤️' },
                        { value: 'fire', emoji: '🔥' },
                        { value: 'rocket', emoji: '🚀' },
                        { value: 'lightning', emoji: '⚡' },
                        { value: 'cloud', emoji: '☁️' },
                        { value: 'server', emoji: '🖥️' },
                        { value: 'database', emoji: '🗄️' },
                        { value: 'shield', emoji: '🛡️' },
                        { value: 'key', emoji: '🔑' },
                        { value: 'lock', emoji: '🔒' },
                        { value: 'unlock', emoji: '🔓' },
                        { value: 'check', emoji: '✅' },
                        { value: 'warning', emoji: '⚠️' },
                        { value: 'info', emoji: 'ℹ️' },
                        { value: 'question', emoji: '❓' },
                        { value: 'exclamation', emoji: '❗' },
                      ];
                      const icon = iconOptions.find(opt => opt.value === app.icon);
                      return icon ? icon.emoji : '🌐';
                    })()}
                  </span>
                  <div>
                    <div className="text-white font-medium">{app.label}</div>
                    <div className="text-gray-400 text-sm">{app.url}</div>
                  </div>
                </div>
                <button
                  onClick={() => removeApp(app.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Skills & Specialties</h3>
          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addSkill()}
              placeholder="Add a skill"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={addSkill}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {formData.skills.map((skill, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm flex items-center gap-2"
              >
                {skill}
                <button
                  onClick={() => removeSkill(skill)}
                  className="text-blue-200 hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Visibility Settings */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Visibility Settings</h3>
          
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_public}
                onChange={(e) => setFormData(prev => ({ ...prev, is_public: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-gray-300">Make this card public</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.show_email}
                onChange={(e) => setFormData(prev => ({ ...prev, show_email: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-gray-300">Show email</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.show_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, show_phone: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-gray-300">Show phone</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.show_location}
                onChange={(e) => setFormData(prev => ({ ...prev, show_location: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-gray-300">Show location</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.show_company}
                onChange={(e) => setFormData(prev => ({ ...prev, show_company: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-gray-300">Show company</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.noindex}
                onChange={(e) => setFormData(prev => ({ ...prev, noindex: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-gray-300">Add noindex (hide from search engines)</span>
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !formData.full_name}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : (businessCard ? 'Update Business Card' : 'Create Business Card')}
          </button>
        </div>
      </div>
    </div>
  );
}
