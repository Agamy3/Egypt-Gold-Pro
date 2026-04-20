'use client';

import { useState } from 'react';

interface IconPickerProps {
  selectedIcon: string;
  onIconChange: (icon: string) => void;
}

const ICON_OPTIONS = [
  { value: 'globe', label: 'Website', emoji: '🌐' },
  { value: 'email', label: 'Email', emoji: '✉️' },
  { value: 'phone', label: 'Phone', emoji: '📞' },
  { value: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { value: 'linkedin', label: 'LinkedIn', emoji: '💼' },
  { value: 'github', label: 'GitHub', emoji: '💻' },
  { value: 'telegram', label: 'Telegram', emoji: '✈️' },
  { value: 'twitter', label: 'Twitter/X', emoji: '🐦' },
  { value: 'instagram', label: 'Instagram', emoji: '📷' },
  { value: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { value: 'youtube', label: 'YouTube', emoji: '📺' },
  { value: 'calendly', label: 'Calendly', emoji: '📅' },
  { value: 'figma', label: 'Figma', emoji: '🎨' },
  { value: 'slack', label: 'Slack', emoji: '💬' },
  { value: 'discord', label: 'Discord', emoji: '🎮' },
  { value: 'notion', label: 'Notion', emoji: '📝' },
  { value: 'medium', label: 'Medium', emoji: '📖' },
  { value: 'substack', label: 'Substack', emoji: '📰' },
  { value: 'gitlab', label: 'GitLab', emoji: '🦊' },
  { value: 'dribbble', label: 'Dribbble', emoji: '🏀' },
  { value: 'behance', label: 'Behance', emoji: '🎯' },
  { value: 'codepen', label: 'CodePen', emoji: '⚡' },
  { value: 'stackoverflow', label: 'Stack Overflow', emoji: '📚' },
  { value: 'reddit', label: 'Reddit', emoji: '🤖' },
  { value: 'pinterest', label: 'Pinterest', emoji: '📌' },
  { value: 'snapchat', label: 'Snapchat', emoji: '👻' },
  { value: 'spotify', label: 'Spotify', emoji: '🎵' },
  { value: 'apple', label: 'Apple', emoji: '🍎' },
  { value: 'google', label: 'Google', emoji: '🔍' },
  { value: 'microsoft', label: 'Microsoft', emoji: '🪟' },
  { value: 'amazon', label: 'Amazon', emoji: '📦' },
  { value: 'shopify', label: 'Shopify', emoji: '🛒' },
  { value: 'paypal', label: 'PayPal', emoji: '💳' },
  { value: 'stripe', label: 'Stripe', emoji: '🔵' },
  { value: 'coinbase', label: 'Coinbase', emoji: '₿' },
  { value: 'binance', label: 'Binance', emoji: '🪙' },
  { value: 'link', label: 'Link', emoji: '🔗' },
  { value: 'star', label: 'Star', emoji: '⭐' },
  { value: 'heart', label: 'Heart', emoji: '❤️' },
  { value: 'fire', label: 'Fire', emoji: '🔥' },
  { value: 'rocket', label: 'Rocket', emoji: '🚀' },
  { value: 'lightning', label: 'Lightning', emoji: '⚡' },
  { value: 'cloud', label: 'Cloud', emoji: '☁️' },
  { value: 'server', label: 'Server', emoji: '🖥️' },
  { value: 'database', label: 'Database', emoji: '🗄️' },
  { value: 'shield', label: 'Shield', emoji: '🛡️' },
  { value: 'key', label: 'Key', emoji: '🔑' },
  { value: 'lock', label: 'Lock', emoji: '🔒' },
  { value: 'unlock', label: 'Unlock', emoji: '🔓' },
  { value: 'check', label: 'Check', emoji: '✅' },
  { value: 'warning', label: 'Warning', emoji: '⚠️' },
  { value: 'info', label: 'Info', emoji: 'ℹ️' },
  { value: 'question', label: 'Question', emoji: '❓' },
  { value: 'exclamation', label: 'Exclamation', emoji: '❗' },
];

export default function IconPicker({ selectedIcon, onIconChange }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedIconData = ICON_OPTIONS.find(icon => icon.value === selectedIcon);

  const filteredIcons = ICON_OPTIONS.filter(icon =>
    icon.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    icon.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">{selectedIconData?.emoji || '🌐'}</span>
          <span>{selectedIconData?.label || 'Select Icon'}</span>
        </div>
        <span className="text-gray-400">▼</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-700">
            <input
              type="text"
              placeholder="Search icons..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredIcons.map((icon) => (
              <button
                key={icon.value}
                type="button"
                onClick={() => {
                  onIconChange(icon.value);
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-700 transition-colors ${
                  selectedIcon === icon.value ? 'bg-gray-700' : ''
                }`}
              >
                <span className="text-xl">{icon.emoji}</span>
                <span className="text-white text-left">{icon.label}</span>
                <span className="text-gray-400 text-sm ml-auto">{icon.value}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
