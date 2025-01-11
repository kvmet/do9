const ExifReader = {
  // Constants and tag definitions
  TIFF_HEADER_START: 0x002a,
  JPEG_START: 0xffd8,
  EXIF_MARKER: 0xffe1,

  // IFD tag definitions separated by type
  mainIfdTags: {
    Make: 0x010f,
    Model: 0x0110,
    Description: 0x010e,
    ExifIFDPointer: 0x8769,
  },

  exifIfdTags: {
    ExposureTime: 0x829a,
    FNumber: 0x829d,
    ISO: 0x8827,
    DateTimeOriginal: 0x9003,
    FocalLength: 0x920a,
    LensModel: 0xa434,
    Flash: 0x9209,
    Comment: 0x9286,
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

  // Mapping for Exposure Mode
  exposureModeMap: {
    0: "Auto",
    1: "Manual",
    2: "Auto bracket",
  },

  // Main entry point
  async read(file) {
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

  // JPEG and EXIF validation
  parseExif(view) {
    if (view.getUint16(0, false) !== this.JPEG_START) {
      throw new Error("Not a valid JPEG");
    }

    const exifOffset = this.findExifOffset(view);
    return this.parseExifData(view, exifOffset);
  },

  findExifOffset(view) {
    const length = view.byteLength;
    let offset = 2;

    while (offset < length) {
      if (view.getUint16(offset, false) === this.EXIF_MARKER) {
        return offset + 4;
      }
      offset += 2 + view.getUint16(offset + 2, false);
    }
    throw new Error("No EXIF data found");
  },

  parseExifData(view, start) {
    if (this.getStringFromBuffer(view, start, 4) !== "Exif") {
      throw new Error("Invalid EXIF data");
    }

    const tiffStart = start + 6; // Skip Exif\0\0
    const { bigEnd, firstIFDOffset } = this.parseTiffHeader(view, tiffStart);

    // Parse main IFD
    const mainIfdData = this.parseIFD(
      view,
      tiffStart + firstIFDOffset,
      tiffStart,
      bigEnd,
      "main",
    );

    // Parse EXIF sub-IFD if it exists
    if (mainIfdData.exifIFDPointer) {
      const exifIfdData = this.parseIFD(
        view,
        tiffStart + mainIfdData.exifIFDPointer,
        tiffStart,
        bigEnd,
        "exif",
      );
      return { ...mainIfdData, ...exifIfdData };
    }

    return mainIfdData;
  },

  parseTiffHeader(view, tiffStart) {
    const bigEnd = view.getUint16(tiffStart) === 0x4d4d;

    if (view.getUint16(tiffStart + 2, !bigEnd) !== this.TIFF_HEADER_START) {
      throw new Error("Not valid TIFF data");
    }

    const firstIFDOffset = view.getUint16(tiffStart + 4, !bigEnd);
    return { bigEnd, firstIFDOffset };
  },

  parseIFD(view, dirStart, tiffStart, bigEnd, ifdType) {
    const result = this.createEmptyResult();
    const numEntries = view.getUint16(dirStart, !bigEnd);
    let offset = dirStart + 2;

    for (let i = 0; i < numEntries; i++) {
      const tagInfo = this.getTagInfo(view, offset, tiffStart, bigEnd);

      if (ifdType === "main") {
        this.processMainIfdTag(result, view, tagInfo, tiffStart, bigEnd);
      } else {
        this.processExifIfdTag(result, view, tagInfo, tiffStart, bigEnd);
      }

      offset += 12;
    }

    return result;
  },
  getTagInfo(view, offset, tiffStart, bigEnd) {
    return {
      tag: view.getUint16(offset, !bigEnd),
      format: view.getUint16(offset + 2, !bigEnd),
      components: view.getUint32(offset + 4, !bigEnd),
      valueOffset: view.getUint32(offset + 8, !bigEnd),
      valueAddress: function () {
        return this.components <= 4 ? offset + 8 : tiffStart + this.valueOffset;
      },
    };
  },

  processMainIfdTag(result, view, tagInfo, tiffStart, bigEnd) {
    switch (tagInfo.tag) {
      case this.mainIfdTags.Make:
        result.make = this.getStringFromBuffer(
          view,
          tiffStart + tagInfo.valueOffset,
          tagInfo.components,
        ).trim();
        break;
      case this.mainIfdTags.Model:
        result.cameraModel = this.getStringFromBuffer(
          view,
          tiffStart + tagInfo.valueOffset,
          tagInfo.components,
        ).trim();
        break;
      case this.mainIfdTags.Description:
        result.description = this.getStringFromBuffer(
          view,
          tiffStart + tagInfo.valueOffset,
          tagInfo.components,
        ).trim();
        break;
      case this.mainIfdTags.ExifIFDPointer:
        result.exifIFDPointer = tagInfo.valueOffset;
        break;
    }
  },

  processExifIfdTag(result, view, tagInfo, tiffStart, bigEnd) {
    switch (tagInfo.tag) {
      case this.exifIfdTags.ExposureTime:
        const num = view.getUint32(tiffStart + tagInfo.valueOffset, !bigEnd);
        const den = view.getUint32(
          tiffStart + tagInfo.valueOffset + 4,
          !bigEnd,
        );
        result.shutterSpeed = `${num}/${den}`;
        break;

      case this.exifIfdTags.FNumber:
        const fnum = view.getUint32(tiffStart + tagInfo.valueOffset, !bigEnd);
        const fden = view.getUint32(
          tiffStart + tagInfo.valueOffset + 4,
          !bigEnd,
        );
        result.aperture = (fnum / fden).toFixed(1);
        break;

      case this.exifIfdTags.ISO:
        result.iso =
          tagInfo.format === 3
            ? view.getUint16(tagInfo.valueAddress(), !bigEnd)
            : view.getUint16(tiffStart + tagInfo.valueOffset, !bigEnd);
        break;

      case this.exifIfdTags.DateTimeOriginal:
        result.dateTime = this.getStringFromBuffer(
          view,
          tiffStart + tagInfo.valueOffset,
          tagInfo.components,
        );
        break;

      case this.exifIfdTags.Comment:
        result.comment = this.getStringFromBuffer(
          view,
          tiffStart + tagInfo.valueOffset,
          tagInfo.components,
        );
        break;

      case this.exifIfdTags.FocalLength:
        const flnum = view.getUint32(tiffStart + tagInfo.valueOffset, !bigEnd);
        const flden = view.getUint32(
          tiffStart + tagInfo.valueOffset + 4,
          !bigEnd,
        );
        result.focalLength = Math.round(flnum / flden);
        break;

      case this.exifIfdTags.LensModel:
        result.lensModel = this.getStringFromBuffer(
          view,
          tiffStart + tagInfo.valueOffset,
          tagInfo.components,
        );
        break;

      case this.exifIfdTags.Flash:
        const flashValue = view.getUint16(
          tiffStart + tagInfo.valueOffset,
          !bigEnd,
        );
        result.flash = this.mappings.flash[flashValue] || "Unknown";
        break;

      case this.exifIfdTags.ExposureMode:
        const exposureMode = view.getUint16(
          tiffStart + tagInfo.valueOffset,
          !bigEnd,
        );
        result.exposureMode =
          this.mappings.exposureMode[exposureMode] || "Unknown";
        break;
    }
  },

  createEmptyResult() {
    return {
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
      comment: null,
      exifIFDPointer: null,
    };
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

export { ExifReader, displayImageWithExif };
