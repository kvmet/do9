const ExifReader = {
  // Tags in the main IFD (Image File Directory)
  mainTags: {
    Make: 0x010f,
    Model: 0x0110,
    Description: 0x010e,
    ExifIFDPointer: 0x8769, // Points to sub-IFD with technical EXIF data
  },

  // Tags in the EXIF sub-IFD
  exifTags: {
    ExposureTime: 0x829a,
    FNumber: 0x829d,
    ISO: 0x8827,
    DateTimeOriginal: 0x9003,
    FocalLength: 0x920a,
    LensModel: 0xa434,
    Flash: 0x9209,
    //Comment: 0x9286,
    ExposureMode: 0xa402,
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

  /* These are pulled from docs:
  0x0	= No Flash
  0x1	= Fired
  0x5	= Fired, Return not detected
  0x7	= Fired, Return detected
  0x8	= On, Did not fire
  0x9	= On, Fired
  0xd	= On, Return not detected
  0xf	= On, Return detected
  0x10	= Off, Did not fire
  0x14	= Off, Did not fire, Return not detected
  0x18	= Auto, Did not fire
  0x19	= Auto, Fired
  0x1d	= Auto, Fired, Return not detected
  0x1f	= Auto, Fired, Return detected
  0x20	= No flash function
  0x30	= Off, No flash function
  0x41	= Fired, Red-eye reduction
  0x45	= Fired, Red-eye reduction, Return not detected
  0x47	= Fired, Red-eye reduction, Return detected
  0x49	= On, Red-eye reduction
  0x4d	= On, Red-eye reduction, Return not detected
  0x4f	= On, Red-eye reduction, Return detected
  0x50	= Off, Red-eye reduction
  0x58	= Auto, Did not fire, Red-eye reduction
  0x59	= Auto, Fired, Red-eye reduction
  0x5d	= Auto, Fired, Red-eye reduction, Return not detected
  0x5f	= Auto, Fired, Red-eye reduction, Return detected */

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

    if (view.getUint16(start + 2, !bigEnd) !== 0x002a) {
      throw new Error("Not valid TIFF data");
    }

    const firstIFDOffset = view.getUint32(start + 4, !bigEnd);

    // Parse main IFD
    const mainIfdResult = this.parseIFD(
      view,
      start + firstIFDOffset,
      tiffOffset,
      bigEnd,
      true,
    );

    // Parse EXIF sub-IFD if pointer exists
    if (mainIfdResult.exifIFDPointer) {
      const subIfdResult = this.parseIFD(
        view,
        tiffOffset + mainIfdResult.exifIFDPointer,
        tiffOffset,
        bigEnd,
        false,
      );
      return { ...mainIfdResult, ...subIfdResult };
    }

    return mainIfdResult;
  },

  parseIFD(view, dirStart, tiffStart, bigEnd, isMainIFD) {
    const result = {
      make: null,
      cameraModel: null,
      description: null,
      shutterSpeed: null,
      aperture: null,
      iso: null,
      focalLength: null,
      dateTime: null,
      lensModel: null,
      flash: null,
      exposureMode: null,
      exifIFDPointer: null,
    };

    const numEntries = view.getUint16(dirStart, !bigEnd);
    let offset = dirStart + 2;

    for (let i = 0; i < numEntries; i++) {
      const tag = view.getUint16(offset, !bigEnd);
      const format = view.getUint16(offset + 2, !bigEnd);
      const components = view.getUint32(offset + 4, !bigEnd);
      let valueOffset = view.getUint32(offset + 8, !bigEnd);

      const valueOffsetAddress =
        components <= 4 ? offset + 8 : tiffStart + valueOffset;

      if (isMainIFD) {
        // Process main IFD tags
        switch (tag) {
          case this.mainTags.Make:
            result.make = this.getStringFromBuffer(
              view,
              tiffStart + valueOffset,
              components,
            ).trim();
            break;
          case this.mainTags.Model:
            result.cameraModel = this.getStringFromBuffer(
              view,
              tiffStart + valueOffset,
              components,
            ).trim();
            break;
          case this.mainTags.Description:
            result.description = this.getStringFromBuffer(
              view,
              tiffStart + valueOffset,
              components,
            ).trim();
            break;
          case this.mainTags.ExifIFDPointer:
            result.exifIFDPointer = valueOffset;
            break;
        }
      } else {
        // Process EXIF sub-IFD tags
        switch (tag) {
          case this.exifTags.ExposureTime:
            const num = view.getUint32(tiffStart + valueOffset, !bigEnd);
            const den = view.getUint32(tiffStart + valueOffset + 4, !bigEnd);
            result.shutterSpeed = `${num}/${den}`;
            break;
          case this.exifTags.FNumber:
            const fnum = view.getUint32(tiffStart + valueOffset, !bigEnd);
            const fden = view.getUint32(tiffStart + valueOffset + 4, !bigEnd);
            result.aperture = (fnum / fden).toFixed(1);
            break;
          case this.exifTags.ISO:
            result.iso =
              format === 3
                ? view.getUint16(valueOffsetAddress, !bigEnd)
                : view.getUint16(tiffStart + valueOffset, !bigEnd);
            break;
          case this.exifTags.DateTimeOriginal:
            result.dateTime = this.getStringFromBuffer(
              view,
              tiffStart + valueOffset,
              components,
            );
            break;
          case this.exifTags.FocalLength:
            const flnum = view.getUint32(tiffStart + valueOffset, !bigEnd);
            const flden = view.getUint32(tiffStart + valueOffset + 4, !bigEnd);
            result.focalLength = Math.round(flnum / flden);
            break;
          case this.exifTags.LensModel:
            result.lensModel = this.getStringFromBuffer(
              view,
              tiffStart + valueOffset,
              components,
            );
            break;
          case this.exifTags.Flash:
            const flashValue = view.getUint16(tiffStart + valueOffset, !bigEnd);
            result.flash = this.flashMap[flashValue] || "Unknown";
            break;
          case this.exifTags.ExposureMode:
            const exposureMode = view.getUint16(
              tiffStart + valueOffset,
              !bigEnd,
            );
            result.exposureMode =
              this.exposureModeMap[exposureMode] || "Unknown";
            break;
        }
      }
      offset += 12;
    }

    return result;
  },

  getStringFromBuffer(buffer, start, length) {
    const array = [];
    for (let i = start; i < start + length; i++) {
      const char = buffer.getUint8(i);
      if (char === 0) break; // Stop at null terminator
      array.push(String.fromCharCode(char));
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
        <li>Camera: ${exifData.make ? `${exifData.make} ` : ""}${exifData.cameraModel || "N/A"}</li>
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
