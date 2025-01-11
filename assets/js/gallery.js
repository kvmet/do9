import { ExifReader } from "./exif-reader.js";

class PhotoGallery {
  constructor(elementId) {
    this.container = document.getElementById(elementId);
    this.currentPath =
      new URLSearchParams(window.location.search).get("path") || "photo/";
    this.bucketUrl = "https://i.do9.co";

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

  async renderImages(images) {
    const imageContainer = document.createElement("div");
    imageContainer.className = "images";

    for (const [baseName, urls] of images) {
      const imageElement = document.createElement("div");
      imageElement.className = "image-item";

      const img = document.createElement("img");
      img.src = urls.preview;
      img.alt = baseName;
      img.loading = "lazy";
      img.onclick = () => this.showFullImage(urls.full);

      imageElement.appendChild(img);

      try {
        const response = await fetch(urls.preview);
        const blob = await response.blob();
        const exifData = await ExifReader.read(blob);

        if (Object.keys(exifData).length > 0) {
          const exifElement = document.createElement("div");
          exifElement.className = "exif-data";
          exifElement.innerHTML = this.formatExifData(exifData);
          imageElement.appendChild(exifElement);
        }
      } catch (err) {
        console.warn("Could not load EXIF data:", err);
      }

      imageContainer.appendChild(imageElement);
    }

    this.container.appendChild(imageContainer);
  }

  formatExifData(exif) {
    let html = '<ul class="exif-details">';

    if (exif.make) html += `<li>Make: ${this.escapeHtml(exif.make)}</li>`;
    if (exif.cameraModel)
      html += `<li>Camera: ${this.escapeHtml(exif.cameraModel)}</li>`;
    if (exif.description)
      html += `<li>Description: ${this.escapeHtml(exif.description)}</li>`;
    if (exif.comment)
      html += `<li>Comment: ${this.escapeHtml(exif.comment)}</li>`;
    if (exif.lensModel)
      html += `<li>Lens: ${this.escapeHtml(exif.lensModel)}</li>`;
    if (exif.dateTime)
      html += `<li>Date: ${this.escapeHtml(exif.dateTime)}</li>`;
    if (exif.shutterSpeed)
      html += `<li>Shutter: ${this.escapeHtml(exif.shutterSpeed)}s</li>`;
    if (exif.aperture) html += `<li>ƒ/${this.escapeHtml(exif.aperture)}</li>`;
    if (exif.iso)
      html += `<li>ISO ${this.escapeHtml(exif.iso.toString())}</li>`;
    if (exif.focalLength)
      html += `<li>${this.escapeHtml(exif.focalLength.toString())}mm</li>`;
    if (exif.flash) html += `<li>Flash: ${this.escapeHtml(exif.flash)}</li>`;
    if (exif.exposureMode)
      html += `<li>Mode: ${this.escapeHtml(exif.exposureMode)}</li>`;

    html += "</ul>";
    return html;
  }

  escapeHtml(unsafe) {
    return unsafe
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
