const ExifFormat = {
  // Common EXIF data formats
  BYTE: 1,
  ASCII: 2,
  SHORT: 3,
  LONG: 4,
  RATIONAL: 5,
  UNDEFINED: 7,
  SLONG: 9,
  SRATIONAL: 10,
};

const ExifTags = {
  // IFD0 (Main image tags)
  ImageTags: {
    Make: { id: 0x010f, name: "Make", format: ExifFormat.ASCII },
    Model: { id: 0x0110, name: "Model", format: ExifFormat.ASCII },
    Description: { id: 0x010e, name: "Description", format: ExifFormat.ASCII },
    ExifIFDPointer: {
      id: 0x8769,
      name: "ExifIFDPointer",
      format: ExifFormat.LONG,
    },
  },

  // EXIF SubIFD tags
  ExifTags: {
    ExposureTime: {
      id: 0x829a,
      name: "ExposureTime",
      format: ExifFormat.RATIONAL,
    },
    FNumber: { id: 0x829d, name: "FNumber", format: ExifFormat.RATIONAL },
    ISO: { id: 0x8827, name: "ISO", format: ExifFormat.SHORT },
    DateTimeOriginal: {
      id: 0x9003,
      name: "DateTimeOriginal",
      format: ExifFormat.ASCII,
    },
    FocalLength: {
      id: 0x920a,
      name: "FocalLength",
      format: ExifFormat.RATIONAL,
    },
    LensModel: { id: 0xa434, name: "LensModel", format: ExifFormat.ASCII },
    Flash: { id: 0x9209, name: "Flash", format: ExifFormat.SHORT },
    ExposureMode: {
      id: 0xa402,
      name: "ExposureMode",
      format: ExifFormat.SHORT,
    },
  },
};

const ValueMaps = {
  Flash: {
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

  ExposureMode: {
    0: "Auto",
    1: "Manual",
    2: "Auto bracket",
  },
};
class ExifParser {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.littleEndian = false;
    this.tiffOffset = 0;
  }

  static async readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(new ExifParser(e.target.result).parse());
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  parse() {
    if (!this.isValidJpeg()) {
      throw new Error("Not a valid JPEG");
    }

    const exifOffset = this.findExifOffset();
    return this.parseExifData(exifOffset);
  }

  isValidJpeg() {
    return this.view.getUint16(0, false) === 0xffd8;
  }

  findExifOffset() {
    let offset = 2;
    while (offset < this.view.byteLength - 2) {
      // Added -2 to prevent buffer overrun
      const marker = this.view.getUint16(offset, false);
      if (marker === 0xffe1) {
        // Get the length of the APP1 segment
        const length = this.view.getUint16(offset + 2, false);
        // Verify there's enough data
        if (offset + 4 + length > this.view.byteLength) {
          throw new Error("Incomplete EXIF segment");
        }
        return offset + 4;
      }
      // Check if we can read the next marker length
      if (offset + 4 > this.view.byteLength) {
        throw new Error("No EXIF data found");
      }
      offset += 2 + this.view.getUint16(offset + 2, false);
    }
    throw new Error("No EXIF data found");
  }

  parseExifData(start) {
    const exifResult = {
      image: {},
      exif: {},
      raw: {},
    };

    // Verify we have enough data to read the EXIF header
    if (start + 10 > this.view.byteLength) {
      throw new Error("Insufficient data for EXIF header");
    }

    // Read "Exif\0\0" marker
    const exifHeader = this.getAsciiValue(start, 6);
    if (exifHeader !== "Exif\0\0") {
      throw new Error("Invalid EXIF header");
    }

    this.tiffOffset = start + 6;

    // Verify we have enough data to read TIFF header
    if (this.tiffOffset + 8 > this.view.byteLength) {
      throw new Error("Insufficient data for TIFF header");
    }

    // Check byte order
    const byteOrder = this.view.getUint16(this.tiffOffset, false);
    this.littleEndian = byteOrder === 0x4949;

    if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) {
      throw new Error("Invalid byte order marker");
    }

    // Check TIFF magic number (42)
    const magic = this.view.getUint16(this.tiffOffset + 2, !this.littleEndian);
    if (magic !== 0x002a) {
      throw new Error("Invalid TIFF magic number");
    }

    // Read offset to first IFD
    const ifd0Offset = this.view.getUint32(
      this.tiffOffset + 4,
      !this.littleEndian,
    );

    // Verify IFD offset is within bounds
    if (this.tiffOffset + ifd0Offset + 2 > this.view.byteLength) {
      throw new Error("IFD offset out of bounds");
    }

    // Parse IFD0
    this.parseIfd(
      this.tiffOffset + ifd0Offset,
      ExifTags.ImageTags,
      exifResult.image,
    );

    // Parse EXIF SubIFD if it exists
    if (exifResult.image.ExifIFDPointer) {
      const exifOffset = this.tiffOffset + exifResult.image.ExifIFDPointer;
      if (exifOffset + 2 <= this.view.byteLength) {
        this.parseIfd(exifOffset, ExifTags.ExifTags, exifResult.exif);
      }
    }

    return this.formatExifData(exifResult);
  }

  parseIfd(offset, tagDefinitions, result) {
    const numEntries = this.view.getUint16(offset, !this.littleEndian);
    let entryOffset = offset + 2;

    for (let i = 0; i < numEntries; i++) {
      const tag = this.view.getUint16(entryOffset, !this.littleEndian);
      const format = this.view.getUint16(entryOffset + 2, !this.littleEndian);
      const components = this.view.getUint32(
        entryOffset + 4,
        !this.littleEndian,
      );
      const valueOffset = this.view.getUint32(
        entryOffset + 8,
        !this.littleEndian,
      );

      const tagInfo = Object.values(tagDefinitions).find((t) => t.id === tag);

      if (tagInfo) {
        result[tagInfo.name] = this.readTagValue(
          format,
          components,
          valueOffset,
          entryOffset + 8,
        );
      }

      entryOffset += 12;
    }
  }

  formatExifData(rawData) {
    return {
      camera: {
        make: rawData.image.Make,
        model: rawData.image.Model,
        description: rawData.image.Description,
      },
      technical: {
        shutterSpeed: this.formatRational(rawData.exif.ExposureTime),
        aperture: this.formatRational(rawData.exif.FNumber),
        iso: rawData.exif.ISO,
        focalLength: this.formatRational(rawData.exif.FocalLength),
        flash: ValueMaps.Flash[rawData.exif.Flash],
        exposureMode: ValueMaps.ExposureMode[rawData.exif.ExposureMode],
      },
      meta: {
        dateTime: rawData.exif.DateTimeOriginal,
        lensModel: rawData.exif.LensModel,
      },
      raw: rawData, // Keep raw data for debugging
    };
  }

  readTagValue(format, components, valueOffset, offsetLocation) {
    const value = this.getRawValue(
      format,
      components,
      valueOffset,
      offsetLocation,
    );

    // For values that fit in 4 bytes, the value offset actually contains the value
    const actualOffset =
      components <= 4 &&
      format !== ExifFormat.RATIONAL &&
      format !== ExifFormat.SRATIONAL
        ? offsetLocation
        : this.tiffOffset + valueOffset;

    switch (format) {
      case ExifFormat.BYTE:
        return this.view.getUint8(actualOffset);

      case ExifFormat.ASCII:
        return this.getAsciiValue(actualOffset, components);

      case ExifFormat.SHORT:
        if (components === 1) {
          return this.view.getUint16(actualOffset, !this.littleEndian);
        } else {
          return this.getShortValues(actualOffset, components);
        }

      case ExifFormat.LONG:
        if (components === 1) {
          return this.view.getUint32(actualOffset, !this.littleEndian);
        } else {
          return this.getLongValues(actualOffset, components);
        }

      case ExifFormat.RATIONAL:
        if (components === 1) {
          return this.getRationalValue(actualOffset);
        } else {
          return this.getRationalValues(actualOffset, components);
        }

      case ExifFormat.UNDEFINED:
        return this.getUndefinedValue(actualOffset, components);

      case ExifFormat.SLONG:
        if (components === 1) {
          return this.view.getInt32(actualOffset, !this.littleEndian);
        } else {
          return this.getSLongValues(actualOffset, components);
        }

      case ExifFormat.SRATIONAL:
        if (components === 1) {
          return this.getSRationalValue(actualOffset);
        } else {
          return this.getSRationalValues(actualOffset, components);
        }

      default:
        console.warn(`Unhandled EXIF format: ${format}`);
        return null;
    }
  }

  // Helper methods for different value types
  getAsciiValue(offset, length) {
    const array = [];
    for (let i = 0; i < length; i++) {
      const char = this.view.getUint8(offset + i);
      if (char === 0) break; // Stop at null terminator
      array.push(String.fromCharCode(char));
    }
    return array.join("");
  }

  getShortValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.view.getUint16(offset + i * 2, !this.littleEndian));
    }
    return values;
  }

  getLongValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.view.getUint32(offset + i * 4, !this.littleEndian));
    }
    return values;
  }

  getSLongValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.view.getInt32(offset + i * 4, !this.littleEndian));
    }
    return values;
  }

  getRationalValue(offset) {
    const numerator = this.view.getUint32(offset, !this.littleEndian);
    const denominator = this.view.getUint32(offset + 4, !this.littleEndian);
    return { numerator, denominator };
  }

  getRationalValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.getRationalValue(offset + i * 8));
    }
    return values;
  }

  getSRationalValue(offset) {
    const numerator = this.view.getInt32(offset, !this.littleEndian);
    const denominator = this.view.getInt32(offset + 4, !this.littleEndian);
    return { numerator, denominator };
  }

  getSRationalValues(offset, count) {
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(this.getSRationalValue(offset + i * 8));
    }
    return values;
  }

  getUndefinedValue(offset, length) {
    const values = [];
    for (let i = 0; i < length; i++) {
      values.push(this.view.getUint8(offset + i));
    }
    return values;
  }

  // Utility method for formatting rational numbers
  formatRational(rational) {
    if (!rational) return null;
    if (Array.isArray(rational)) {
      return rational.map((r) => this.formatRational(r));
    }
    const { numerator, denominator } = rational;
    if (denominator === 0) return null;

    // Format special cases like exposure time
    if (numerator === 1) {
      return `1/${denominator}`;
    }

    return (numerator / denominator).toFixed(2);
  }
}

export { ExifParser };
