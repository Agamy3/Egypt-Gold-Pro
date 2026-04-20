import Link from 'next/link';

export default function BusinessCardNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto bg-gray-800 rounded-full flex items-center justify-center text-4xl mb-4">
            🪪
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Business Card Not Found</h1>
          <p className="text-gray-400 mb-8">
            The business card you're looking for doesn't exist or is not publicly available.
          </p>
        </div>
        
        <div className="space-y-4">
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Go to Homepage
          </Link>
          
          <div className="text-sm text-gray-500">
            <p>If you believe this is an error, please contact the card&apos;s owner.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
