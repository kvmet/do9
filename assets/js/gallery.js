import { ExifParser } from "./exif-reader.js";

class PhotoGallery {
  constructor(elementId) {
    this.container = document.getElementById(elementId);
    this.currentPath =
      new URLSearchParams(window.location.search).get("path") || "photo/";
    this.bucketUrl = "https://i.do9.co";

    // Define standard image sizes
    this.imageSizes = {
      thumbnail: 250, // For the grid view
      preview: 800, // For the lightbox preview
      full: 1920, // For full-size viewing
    };

    this.init();

    window.addEventListener("popstate", () => {
      this.currentPath =
        new URLSearchParams(window.location.search).get("path") || "photo/";
      this.loadGallery();
    });
  }

  async init() {
    await this.loadGallery();
  }

  async loadGallery() {
    this.container.innerHTML = '<div class="loading">Loading gallery...</div>';

    try {
      const response = await fetch(
        `https://photo-list.kmet28.workers.dev/${this.currentPath}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");

      const directories = new Set();
      const dirs = xmlDoc.getElementsByTagName("Directory");
      Array.from(dirs).forEach((dir) => {
        const path = dir.textContent;
        const relativePath = path.slice(this.currentPath.length);
        if (relativePath) {
          const dirName = relativePath.split("/")[0];
          if (dirName) directories.add(dirName);
        }
      });

      const images = new Map();
      const files = xmlDoc.getElementsByTagName("File");
      Array.from(files).forEach((file) => {
        const key = file.getElementsByTagName("Key")[0].textContent;
        const baseNameMatch = key.match(/(.*?)_(preview|full)\.(.*)/);
        if (baseNameMatch) {
          const [, baseName, type, ext] = baseNameMatch;
          if (!images.has(baseName)) {
            images.set(baseName, {});
          }
          images.get(baseName)[type] = `${this.bucketUrl}/${key}`;
        }
      });

      this.container.innerHTML = "";
      this.addBreadcrumbs();
      this.renderDirectories(directories);
      await this.renderImages(images);
    } catch (err) {
      console.error("Detailed error:", err);
      this.container.innerHTML = `<div class="error">Error loading gallery: ${err.message}</div>`;
    }
  }

  addBreadcrumbs() {
    const breadcrumbs = document.createElement("div");
    breadcrumbs.className = "breadcrumbs";

    let html = '<a href="?path=photo/">Home</a>';
    let currentPath = "photo/";

    const parts = this.currentPath
      .slice(6)
      .split("/")
      .filter((p) => p);
    parts.forEach((part) => {
      currentPath += part + "/";
      html += ` > <a href="?path=${currentPath}">${part}</a>`;
    });

    breadcrumbs.innerHTML = html;
    this.container.appendChild(breadcrumbs);
  }

  renderDirectories(directories) {
    if (directories.size > 0) {
      const dirContainer = document.createElement("div");
      dirContainer.className = "directories";

      directories.forEach((dir) => {
        const dirElement = document.createElement("a");
        dirElement.className = "directory";
        dirElement.href = `?path=${this.currentPath}${dir}/`;
        dirElement.innerHTML = `📁 ${dir}`;
        dirContainer.appendChild(dirElement);
      });

      this.container.appendChild(dirContainer);
    }
  }

  getResizedImageUrl(originalUrl, width, options = {}) {
    // Convert the full URL to a path-only URL
    const urlPath = originalUrl.replace(this.bucketUrl, "");

    // Build the Cloudflare Image Resizing URL
    const cfOptions = [
      `width=${width}`,
      `quality=${options.quality || 75}`,
      `fit=${options.fit || "scale-down"}`,
    ];

    return `/cdn-cgi/image/${cfOptions.join(",")}${urlPath}`;
  }

  async renderImages(images) {
    const imageContainer = document.createElement("div");
    imageContainer.className = "images";

    for (const [baseName, urls] of images) {
      const imageElement = document.createElement("div");
      imageElement.className = "image-item";

      // Create thumbnail image with optimized size
      const img = document.createElement("img");
      img.src = this.getResizedImageUrl(
        urls.preview,
        this.imageSizes.thumbnail,
      );
      img.alt = baseName;
      img.loading = "lazy";

      // When clicking, show a larger preview in the lightbox
      img.onclick = () => this.showFullImage(urls.full);

      imageElement.appendChild(img);

      try {
        // Use the thumbnail for EXIF data to save bandwidth
        const response = await fetch(img.src);
        const blob = await response.blob();
        const exifData = await ExifParser.readFile(blob);

        if (exifData && this.hasValidExifData(exifData)) {
          const exifElement = document.createElement("div");
          exifElement.className = "exif-data";
          exifElement.innerHTML = this.formatExifData(exifData);
          imageElement.appendChild(exifElement);
        }
      } catch (err) {
        console.warn(`Could not load EXIF data for ${baseName}:`, err);
      }

      imageContainer.appendChild(imageElement);
    }

    this.container.appendChild(imageContainer);
  }

  showFullImage(url) {
    const lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.onclick = () => lightbox.remove();

    const img = document.createElement("img");

    // First load a medium-sized preview
    img.src = this.getResizedImageUrl(url, this.imageSizes.preview);

    // Then load the full-size image if needed
    const fullImg = new Image();
    fullImg.onload = () => {
      img.src = this.getResizedImageUrl(url, this.imageSizes.full);
    };
    fullImg.src = this.getResizedImageUrl(url, this.imageSizes.full);

    lightbox.appendChild(img);
    document.body.appendChild(lightbox);
  }

  hasValidExifData(exif) {
    return (
      exif &&
      (exif.camera.make ||
        exif.camera.model ||
        exif.camera.imageDescription ||
        exif.technical.shutterSpeed ||
        exif.technical.aperture ||
        exif.technical.iso ||
        exif.technical.focalLength ||
        exif.meta.dateTime ||
        exif.meta.lensModel ||
        exif.meta.userComment ||
        exif.technical.flash ||
        exif.technical.exposureMode)
    );
  }

  formatExifData(exif) {
    const items = [];

    if (exif.camera.imageDescription) {
      items.push(
        `<li><strong>Description:</strong> ${this.escapeHtml(exif.camera.imageDescription)}</li>`,
      );
    }
    if (exif.camera.make && exif.camera.model) {
      items.push(
        `<li>Camera: ${this.escapeHtml(exif.camera.make)} ${this.escapeHtml(exif.camera.model)}</li>`,
      );
    } else if (exif.camera.model) {
      items.push(`<li>Camera: ${this.escapeHtml(exif.camera.model)}</li>`);
    }

    if (exif.meta.lensModel) {
      items.push(`<li>Lens: ${this.escapeHtml(exif.meta.lensModel)}</li>`);
    }

    if (exif.meta.dateTime) {
      items.push(`<li>Date: ${this.escapeHtml(exif.meta.dateTime)}</li>`);
    }

    const technicalInfo = [];
    if (exif.technical.shutterSpeed)
      technicalInfo.push(`${this.escapeHtml(exif.technical.shutterSpeed)}s`);
    if (exif.technical.aperture)
      technicalInfo.push(`ƒ/${this.escapeHtml(exif.technical.aperture)}`);
    if (exif.technical.iso)
      technicalInfo.push(
        `ISO ${this.escapeHtml(exif.technical.iso.toString())}`,
      );
    if (exif.technical.focalLength)
      technicalInfo.push(`${this.escapeHtml(exif.technical.focalLength)}mm`);

    if (technicalInfo.length > 0) {
      items.push(`<li>${technicalInfo.join(" • ")}</li>`);
    }

    if (exif.technical.flash) {
      items.push(`<li>Flash: ${this.escapeHtml(exif.technical.flash)}</li>`);
    }

    if (exif.technical.exposureMode) {
      items.push(
        `<li>Mode: ${this.escapeHtml(exif.technical.exposureMode)}</li>`,
      );
    }

    if (exif.meta.userComment) {
      items.push(
        `<li><strong>Comment:</strong> ${this.escapeHtml(exif.meta.userComment)}</li>`,
      );
    }

    return items.length > 0
      ? `<ul class="exif-details">${items.join("")}</ul>`
      : "";
  }

  escapeHtml(unsafe) {
    if (unsafe == null) return "";
    return unsafe
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  showFullImage(url) {
    const lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.onclick = () => lightbox.remove();

    const img = document.createElement("img");
    img.src = url;

    lightbox.appendChild(img);
    document.body.appendChild(lightbox);
  }
}

// Initialize the gallery when the page loads
document.addEventListener("DOMContentLoaded", () => {
  const gallery = new PhotoGallery("photoGallery");
});
