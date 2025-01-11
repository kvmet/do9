const ExifReader = {
  tags: {
    Make: 0x010f, // 0x10f - Manufacturer
    Model: 0x0110, // 0x110 - Camera Model
    XResolution: 0x011a, // 0x11a - X Resolution
    YResolution: 0x011b, // 0x11b - Y Resolution
    Software: 0x0131, // 0x131 - Software
    DateTime: 0x0132, // 0x132 - Date/Time
    ExifIFDPointer: 0x8769, // 0x8769 - Pointer to EXIF data

    // Sub-IFD EXIF tags
    ExposureTime: 0x829a,
    FNumber: 0x829d,
    ISO: 0x8827,
    DateTimeOriginal: 0x9003,
    FocalLength: 0x920a,
    LensModel: 0xa434,
  },

  // Mapping for Flash values
  flashMap: {
    0x0: "No Flash",
    0x1: "Flash Fired",
    0x5: "Flash Fired, Return not detected",
    0x7: "Flash Fired, Return detected",
    0x8: "On, Flash did not fire",
    0x9: "Flash Fired, Compulsory",
    0xd: "Flash Fired, Compulsory, Return not detected",
    0xf: "Flash Fired, Compulsory, Return detected",
    0x10: "Off, Did not fire",
    0x18: "Off, Did not fire, Return not detected",
    0x19: "Flash Fired, Auto",
    0x1d: "Flash Fired, Auto, Return not detected",
    0x1f: "Flash Fired, Auto, Return detected",
    0x20: "No flash function",
    0x41: "Flash Fired, Red-eye reduction",
    0x45: "Flash Fired, Red-eye reduction, Return not detected",
    0x47: "Flash Fired, Red-eye reduction, Return detected",
    0x49: "Flash Fired, Compulsory, Red-eye reduction",
    0x4d: "Flash Fired, Compulsory, Red-eye reduction, Return not detected",
    0x4f: "Flash Fired, Compulsory, Red-eye reduction, Return detected",
    0x59: "Flash Fired, Auto, Red-eye reduction",
    0x5d: "Flash Fired, Auto, Return not detected, Red-eye reduction",
    0x5f: "Flash Fired, Auto, Return detected, Red-eye reduction",
  },

  // Mapping for Exposure Mode
  exposureModeMap: {
    0: "Auto",
    1: "Manual",
    2: "Auto bracket",
  },

  read(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);
          const exif = this.parseExif(view);
          resolve(exif);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject("Error reading file");
      reader.readAsArrayBuffer(file);
    });
  },

  parseExif(view) {
    if (view.getUint16(0, false) !== 0xffd8) {
      throw new Error("Not a valid JPEG");
    }

    const length = view.byteLength;
    let offset = 2;

    while (offset < length) {
      if (view.getUint16(offset, false) === 0xffe1) {
        return this.parseExifData(view, offset + 4);
      }
      offset += 2 + view.getUint16(offset + 2, false);
    }

    throw new Error("No EXIF data found");
  },

  parseExifData(view, start) {
    if (this.getStringFromBuffer(view, start, 4) !== "Exif") {
      throw new Error("Invalid EXIF data");
    }

    start += 6; // Skip Exif\0\0

    const tiffOffset = start;
    const bigEnd = view.getUint16(start) === 0x4d4d;
    const ifdOffset = view.getUint32(start + 4, !bigEnd);

    return this.parseIFD(view, start + ifdOffset, tiffOffset, bigEnd);
  },

  parseIFD(view, dirStart, tiffStart, bigEnd) {
    const result = {
      shutterSpeed: null,
      aperture: null,
      iso: null,
      focalLength: null,
      dateTime: null,
      lensModel: null,
      cameraModel: null,
    };

    const numEntries = view.getUint16(dirStart, !bigEnd);
    let offset = dirStart + 2;

    console.log(
      `Parsing IFD at offset ${dirStart}, found ${numEntries} entries`,
    );

    for (let i = 0; i < numEntries; i++) {
      const tag = view.getUint16(offset, !bigEnd);
      const format = view.getUint16(offset + 2, !bigEnd);
      const components = view.getUint32(offset + 4, !bigEnd);
      const valueOffset = view.getUint32(offset + 8, !bigEnd);

      console.log(
        `Tag: 0x${tag.toString(16)}, Format: ${format}, Components: ${components}, ValueOffset: ${valueOffset}`,
      );

      // Handle the ExifIFDPointer to get to the extended EXIF data
      if (tag === this.tags.ExifIFDPointer) {
        const subResult = this.parseIFD(
          view,
          tiffStart + valueOffset,
          tiffStart,
          bigEnd,
        );
        Object.assign(result, subResult);
      }

      // Handle main IFD tags
      if (tag === this.tags.Model) {
        const modelOffset = tiffStart + valueOffset;
        result.cameraModel = this.getStringFromBuffer(
          view,
          modelOffset,
          components - 1,
        );
      }

      offset += 12;
    }

    return result;
  },

  getStringFromBuffer(buffer, start, length) {
    const array = [];
    for (let i = start; i < start + length; i++) {
      array.push(String.fromCharCode(buffer.getUint8(i)));
    }
    return array.join("");
  },
};

async function displayImageWithExif(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    const img = document.createElement("img");
    img.src = URL.createObjectURL(blob);

    const exifData = await ExifReader.read(blob);

    const container = document.createElement("div");
    container.className = "image-container";

    container.appendChild(img);

    const exifDisplay = document.createElement("div");
    exifDisplay.className = "exif-data";
    exifDisplay.innerHTML = `
            <ul>
                <li>Camera: ${exifData.cameraModel || "N/A"}</li>
                <li>Lens: ${exifData.lensModel || "N/A"}</li>
                <li>Date: ${exifData.dateTime || "N/A"}</li>
                <li>Shutter Speed: ${exifData.shutterSpeed || "N/A"}</li>
                <li>Aperture: ƒ/${exifData.aperture || "N/A"}</li>
                <li>ISO: ${exifData.iso || "N/A"}</li>
                <li>Focal Length: ${exifData.focalLength}mm</li>
                <li>Flash: ${exifData.flash || "N/A"}</li>
                <li>Exposure Mode: ${exifData.exposureMode || "N/A"}</li>
            </ul>
        `;

    container.appendChild(exifDisplay);
    return container;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

export { ExifReader, displayImageWithExif };
