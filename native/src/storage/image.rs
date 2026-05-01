//! Image processing: resize, compress to WebP, generate thumbnails.

use image::GenericImageView;
use std::path::Path;

/// Processed image result.
pub struct ProcessedImage {
    /// Path to the full-size WebP image.
    pub webp_path: String,
    /// Path to the thumbnail (150px).
    pub thumbnail_path: String,
    /// Image dimensions (width, height).
    pub dimensions: (u32, u32),
}

/// Process an image: resize if too large, convert to WebP, generate thumbnail.
pub fn process_image(
    image_data: &[u8],
    output_dir: &str,
    image_id: &str,
    max_width: u32,
) -> Result<ProcessedImage, String> {
    let img = image::load_from_memory(image_data)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let (w, h) = img.dimensions();

    // Resize if needed
    let resized = if w > max_width {
        let ratio = max_width as f32 / w as f32;
        let new_h = (h as f32 * ratio) as u32;
        img.resize(max_width, new_h, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    // Save as WebP
    let out_dir = Path::new(output_dir);
    std::fs::create_dir_all(out_dir)
        .map_err(|e| format!("Cannot create image dir: {}", e))?;

    let webp_path = out_dir.join(format!("{}.webp", image_id));
    resized
        .save(&webp_path)
        .map_err(|e| format!("Failed to save WebP: {}", e))?;

    // Generate 150px thumbnail
    let thumb_w = 150_u32;
    let thumb_ratio = thumb_w as f32 / w as f32;
    let thumb_h = (h as f32 * thumb_ratio) as u32;
    let thumbnail = resized.resize(thumb_w, thumb_h, image::imageops::FilterType::Lanczos3);

    let thumb_path = out_dir.join(format!("{}_thumb.webp", image_id));
    thumbnail
        .save(&thumb_path)
        .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

    Ok(ProcessedImage {
        webp_path: webp_path.to_string_lossy().to_string(),
        thumbnail_path: thumb_path.to_string_lossy().to_string(),
        dimensions: (w, h),
    })
}
