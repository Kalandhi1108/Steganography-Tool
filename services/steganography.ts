
// This tells TypeScript to expect CryptoJS to be available globally,
// as it's included via a <script> tag in index.html.
declare var CryptoJS: any;

/**
 * Loads an image file onto a canvas element.
 * @param imageFile The image file to load.
 * @returns A promise that resolves with the canvas and its 2D rendering context.
 */
const loadImageToCanvas = (imageFile: File): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context.'));
                }
                ctx.drawImage(img, 0, 0);
                resolve({ canvas, ctx });
            };
            img.onerror = () => reject(new Error('Failed to load image.'));
            img.src = event.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(imageFile);
    });
};

/**
 * Creates a seeded pseudo-random number generator.
 * @param seed A string seed (e.g., a password hash).
 * @returns A function that generates pseudo-random numbers between 0 and 1.
 */
const createSeededRandom = (seed: string) => {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    }
    return () => {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
};

/**
 * Shuffles an array in place using the Fisher-Yates algorithm with a seeded RNG.
 * @param array The array to shuffle.
 * @param rng A pseudo-random number generator function.
 */
const shuffleArray = <T,>(array: T[], rng: () => number): void => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
};

/**
 * Generates a shuffled list of pixel coordinates.
 * @param width The width of the image.
 * @param height The height of the image.
 * @param password The password to seed the shuffle.
 * @returns An array of shuffled pixel indices.
 */
const getShuffledPixelIndices = (width: number, height: number, password: string): number[] => {
    const pixelCount = width * height;
    const indices = Array.from({ length: pixelCount }, (_, i) => i);
    const passwordHash = CryptoJS.SHA256(password).toString();
    const rng = createSeededRandom(passwordHash);
    shuffleArray(indices, rng);
    return indices;
};


// Helper functions for data conversion
const stringToBinary = (str: string): string => {
    // Each character in the ciphertext (Base64) is ASCII and can be represented by 8 bits.
    // Using 16 bits was inefficient and halved the data capacity.
    return str.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
};

const binaryToString = (binary: string): string => {
    // Match 8-bit chunks to convert back to characters.
    const chars = binary.match(/.{1,8}/g) || [];
    return chars.map(char => String.fromCharCode(parseInt(char, 2))).join('');
};

const numberTo32BitBinary = (num: number): string => {
    return num.toString(2).padStart(32, '0');
};

const binaryToNumber = (binary: string): number => {
    return parseInt(binary, 2);
};


/**
 * Encodes a secret message into a cover image.
 * @param coverImage The image to hide data in.
 * @param data The string data to hide.
 * @param password The password for encryption and pixel randomization.
 * @returns A promise that resolves with the data URL of the new stego image.
 */
export const encode = async (coverImage: File, data: string, password: string): Promise<string> => {
    const { canvas, ctx } = await loadImageToCanvas(coverImage);
    const { width, height } = canvas;

    const ciphertext = CryptoJS.AES.encrypt(data, password).toString();
    const binaryCipher = stringToBinary(ciphertext);
    const binaryLen = numberTo32BitBinary(binaryCipher.length);
    const payload = binaryLen + binaryCipher;
    
    const capacity = width * height * 3;
    if (payload.length > capacity) {
        throw new Error(`Message is too large for this image. Required capacity: ${payload.length} bits. Available: ${capacity} bits.`);
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const shuffledIndices = getShuffledPixelIndices(width, height, password);
    
    let bitIndex = 0;
    
    for (let i = 0; i < shuffledIndices.length && bitIndex < payload.length; i++) {
        const pixelIndex = shuffledIndices[i] * 4;

        // R channel
        if (bitIndex < payload.length) {
            pixels[pixelIndex] = (pixels[pixelIndex] & 0xFE) | parseInt(payload[bitIndex++], 2);
        }
        // G channel
        if (bitIndex < payload.length) {
            pixels[pixelIndex + 1] = (pixels[pixelIndex + 1] & 0xFE) | parseInt(payload[bitIndex++], 2);
        }
        // B channel
        if (bitIndex < payload.length) {
            pixels[pixelIndex + 2] = (pixels[pixelIndex + 2] & 0xFE) | parseInt(payload[bitIndex++], 2);
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
};

/**
 * Decodes a secret message from a stego image.
 * @param stegoImage The image containing hidden data.
 * @param password The password for decryption and pixel randomization.
 * @returns A promise that resolves with the decoded string data.
 */
export const decode = async (stegoImage: File, password: string): Promise<string> => {
    const { canvas, ctx } = await loadImageToCanvas(stegoImage);
    const { width, height } = canvas;

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const shuffledIndices = getShuffledPixelIndices(width, height, password);

    let binaryLen = '';
    let bitIndex = 0;
    let pixelOrderIndex = 0;
    
    // Extract the 32-bit length header
    while (binaryLen.length < 32 && pixelOrderIndex < shuffledIndices.length) {
        const pixelIndex = shuffledIndices[pixelOrderIndex] * 4;
        
        if(binaryLen.length < 32) binaryLen += (pixels[pixelIndex] & 1).toString();
        if(binaryLen.length < 32) binaryLen += (pixels[pixelIndex+1] & 1).toString();
        if(binaryLen.length < 32) binaryLen += (pixels[pixelIndex+2] & 1).toString();

        pixelOrderIndex++;
    }

    if (binaryLen.length < 32) {
        throw new Error('Could not read message length. Image may be corrupt or too small.');
    }
    
    const messageLength = binaryToNumber(binaryLen);
    
    // Check if message length is plausible
    const capacity = width * height * 3;
    if (messageLength < 0 || messageLength > capacity) {
        throw new Error('Invalid message length in header. The password may be incorrect or the data is corrupted.');
    }

    let binaryCipher = '';

    // We already used some bits for the length, figure out the remainder.
    const bitsUsedForLength = 32;
    const channelsPerPixel = 3;
    const pixelsUsedForLength = Math.ceil(bitsUsedForLength / channelsPerPixel);
    const leftoverBitsInLastPixel = (pixelsUsedForLength * channelsPerPixel) - bitsUsedForLength;

    pixelOrderIndex = pixelsUsedForLength - 1; // Start from the last pixel read
    let startChannel = channelsPerPixel - leftoverBitsInLastPixel;
    
    while (binaryCipher.length < messageLength && pixelOrderIndex < shuffledIndices.length) {
        const pixelIndex = shuffledIndices[pixelOrderIndex] * 4;

        for (let channel = startChannel; channel < channelsPerPixel; channel++) {
             if (binaryCipher.length < messageLength) {
                binaryCipher += (pixels[pixelIndex + channel] & 1).toString();
            }
        }
        
        startChannel = 0; // Reset for subsequent pixels
        pixelOrderIndex++;
    }


    if (binaryCipher.length < messageLength) {
        throw new Error('Failed to extract full message. The image might be corrupted.');
    }

    const ciphertext = binaryToString(binaryCipher);

    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, password);
        const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedData) {
            throw new Error('Decryption failed. Check your password.');
        }
        return decryptedData;
    } catch (e) {
        throw new Error('Decryption failed. The password is likely incorrect or the data is corrupt.');
    }
};
