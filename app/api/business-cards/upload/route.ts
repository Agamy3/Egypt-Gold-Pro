import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';

// Allowed file types and size limits
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DIMENSION = 2048; // Max width/height in pixels

export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const { supabase, user } = await requireAdmin();

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const imageType = formData.get('type') as string; // 'avatar', 'banner', or 'company_logo'

    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!imageType || !['avatar', 'banner', 'company_logo'].includes(imageType)) {
      return NextResponse.json(
        { error: 'Invalid image type. Must be avatar, banner, or company_logo' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB' },
        { status: 400 }
      );
    }

    // Validate image dimensions
    const dimensions = await getImageDimensions(file);
    if (!dimensions) {
      return NextResponse.json(
        { error: 'Invalid image file' },
        { status: 400 }
      );
    }

    // Check dimensions based on image type
    if (imageType === 'avatar') {
      if (dimensions.width < 100 || dimensions.height < 100) {
        return NextResponse.json(
          { error: 'Avatar must be at least 100x100 pixels' },
          { status: 400 }
        );
      }
      if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
        return NextResponse.json(
          { error: `Avatar dimensions too large. Maximum is ${MAX_DIMENSION}x${MAX_DIMENSION} pixels` },
          { status: 400 }
        );
      }
    } else if (imageType === 'banner') {
      if (dimensions.width < 800) {
        return NextResponse.json(
          { error: 'Banner must be at least 800 pixels wide' },
          { status: 400 }
        );
      }
      if (dimensions.width > 3000 || dimensions.height > 1000) {
        return NextResponse.json(
          { error: 'Banner dimensions too large. Maximum is 3000x1000 pixels' },
          { status: 400 }
        );
      }
    } else if (imageType === 'company_logo') {
      if (dimensions.width < 50 || dimensions.height < 50) {
        return NextResponse.json(
          { error: 'Company logo must be at least 50x50 pixels' },
          { status: 400 }
        );
      }
      if (dimensions.width > 1000 || dimensions.height > 1000) {
        return NextResponse.json(
          { error: `Company logo dimensions too large. Maximum is 1000x1000 pixels` },
          { status: 400 }
        );
      }
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const filename = `business-cards/${user.id}/${imageType}_${timestamp}.${fileExtension}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('business-card-images')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to upload image';
      if (uploadError.message.includes('bucket') || uploadError.message.includes('not found')) {
        errorMessage = 'Storage bucket not found. Please contact administrator.';
      } else if (uploadError.message.includes('permission') || uploadError.message.includes('policy')) {
        errorMessage = 'Permission denied. Check storage policies.';
      } else if (uploadError.message.includes('size')) {
        errorMessage = 'File too large. Maximum size is 5MB.';
      } else if (uploadError.message.includes('mime')) {
        errorMessage = 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.';
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: uploadError.message
        },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('business-card-images')
      .getPublicUrl(filename);

    if (!urlData?.publicUrl) {
      return NextResponse.json(
        { error: 'Failed to get public URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        url: urlData.publicUrl,
        filename: uploadData.path,
        size: file.size,
        type: imageType,
        dimensions,
      },
    });

  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to get image dimensions using server-side processing
async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Simple image dimension detection for JPEG/PNG
    // For now, we'll use a basic approach - in production, consider using sharp or jimp
    
    if (file.type === 'image/jpeg') {
      // JPEG format - look for SOF markers
      if (buffer.length < 4) return null;
      
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xFF) {
          if (buffer[offset + 1] === 0xC0 || buffer[offset + 1] === 0xC2) {
            // Found SOF0 or SOF2 marker
            return {
              width: (buffer[offset + 7] << 8) | buffer[offset + 8],
              height: (buffer[offset + 5] << 8) | buffer[offset + 6]
            };
          }
        }
        offset++;
      }
    } else if (file.type === 'image/png') {
      // PNG format - IHDR chunk
      if (buffer.length < 24) return null;
      
      // PNG signature check
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return {
          width: (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19],
          height: (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23]
        };
      }
    } else if (file.type === 'image/webp') {
      // WebP format - basic VP8/VP8L detection
      if (buffer.length < 30) return null;
      
      // Look for VP8 chunk
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38) {
        return {
          width: (buffer[26] << 8) | buffer[27],
          height: (buffer[24] << 8) | buffer[25]
        };
      }
    } else if (file.type === 'image/gif') {
      // GIF format
      if (buffer.length < 10) return null;
      
      // GIF signature check
      if ((buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38)) {
        return {
          width: buffer[6] | (buffer[7] << 8),
          height: buffer[8] | (buffer[9] << 8)
        };
      }
    }
    
    // Fallback - return null if we can't detect dimensions
    return null;
  } catch (error) {
    console.error('Error getting image dimensions:', error);
    return null;
  }
}

// DELETE endpoint for removing images
export async function DELETE(request: NextRequest) {
  try {
    // Verify admin access
    const { supabase, user } = await requireAdmin();

    // Parse request body
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json(
        { error: 'No filename provided' },
        { status: 400 }
      );
    }

    // Verify the file belongs to the current user
    if (!filename.includes(`business-cards/${user.id}/`)) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this file' },
        { status: 403 }
      );
    }

    // Delete from Supabase Storage
    const { error: deleteError } = await supabase.storage
      .from('business-card-images')
      .remove([filename]);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete image' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully',
    });

  } catch (error) {
    console.error('Delete API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
