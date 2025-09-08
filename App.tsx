
import React, { useState, useCallback } from 'react';
import { encode, decode } from './services/steganography';
import { ImageDropzone } from './components/ImageDropzone';
import { Loader } from './components/Loader';
import { DownloadIcon, KeyIcon, LockIcon, FileIcon } from './components/icons';

type Mode = 'encode' | 'decode';
type ExtractedData = { type: 'text', content: string } | { type: 'files', files: Array<{ name: string; dataUrl: string }> } | null;

const App: React.FC = () => {
    const [mode, setMode] = useState<Mode>('encode');
    const [coverImage, setCoverImage] = useState<File | null>(null);
    const [stegoImage, setStegoImage] = useState<File | null>(null);
    const [secretText, setSecretText] = useState('');
    const [secretFiles, setSecretFiles] = useState<File[]>([]);
    const [password, setPassword] = useState('');
    const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('');
    
    const resetState = useCallback(() => {
        setCoverImage(null);
        setStegoImage(null);
        setSecretText('');
        setSecretFiles([]);
        setPassword('');
        setResultImageUrl(null);
        setExtractedData(null);
        setError(null);
        setStatusMessage('');
    }, []);

    const handleModeChange = (newMode: Mode) => {
        setMode(newMode);
        resetState();
    };

    const handleEncode = async () => {
        if (!coverImage) {
            setError('Please provide a cover image.');
            return;
        }
        if (!secretText && secretFiles.length === 0) {
            setError('Please provide a secret message or at least one secret file.');
            return;
        }
        if (!password) {
            setError('A password is required for encryption.');
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setResultImageUrl(null);
        setStatusMessage('Starting encoding process...');

        try {
            let dataToEncode: string;
            if(secretFiles.length > 0) {
                setStatusMessage(`Reading ${secretFiles.length} secret file(s)...`);
                
                const filePromises = secretFiles.map(file => {
                    return new Promise<{name: string, type: string, data: string}>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const base64 = (reader.result as string).split(',')[1];
                            resolve({ name: file.name, type: file.type, data: base64 });
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                });

                const filesData = await Promise.all(filePromises);
                const bundle = { files: filesData };
                dataToEncode = `bundle::${JSON.stringify(bundle)}`;

            } else {
                dataToEncode = `text::${secretText}`;
            }

            setStatusMessage('Encrypting data and embedding into image...');
            const resultUrl = await encode(coverImage, dataToEncode, password);
            setResultImageUrl(resultUrl);
            setStatusMessage('Encoding complete!');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred during encoding.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDecode = async () => {
        if (!stegoImage) {
            setError('Please provide an image to decode.');
            return;
        }
        if (!password) {
            setError('A password is required for decryption.');
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setExtractedData(null);
        setStatusMessage('Starting decoding process...');

        try {
            setStatusMessage('Extracting and decrypting data from image...');
            const result = await decode(stegoImage, password);
            const [dataType, ...rest] = result.split('::');

            if (dataType === 'text') {
                setExtractedData({ type: 'text', content: rest.join('::') });
            } else if (dataType === 'bundle') {
                const bundleJSON = rest.join('::');
                try {
                    const bundle = JSON.parse(bundleJSON);
                    if (bundle && Array.isArray(bundle.files)) {
                        const extractedFiles = bundle.files.map((file: any) => ({
                            name: file.name,
                            dataUrl: `data:${file.type};base64,${file.data}`
                        }));
                        setExtractedData({ type: 'files', files: extractedFiles });
                    } else {
                        throw new Error('Invalid file bundle format found in image.');
                    }
                } catch(jsonError) {
                    throw new Error('Failed to parse hidden file data. Data may be corrupted.');
                }
            } else {
                throw new Error('Could not identify hidden data type. The password may be incorrect or the image may not contain valid data.');
            }
            setStatusMessage('Decoding complete!');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred during decoding. The password might be incorrect or the image data is corrupted.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const renderEncodePane = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Input Column */}
            <div className="space-y-6">
                <div className="p-6 bg-brand-secondary rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-brand-cyan">1. Cover Image</h3>
                    <ImageDropzone file={coverImage} onFileChange={setCoverImage} />
                </div>
                <div className="p-6 bg-brand-secondary rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-brand-cyan">2. Secret Data</h3>
                    <textarea 
                        className="w-full p-3 bg-brand-primary border border-brand-accent rounded-md focus:ring-2 focus:ring-brand-cyan focus:outline-none transition"
                        rows={4}
                        placeholder="Type your secret message here..."
                        value={secretText}
                        onChange={(e) => { setSecretText(e.target.value); setSecretFiles([]); }}
                        disabled={secretFiles.length > 0}
                    />
                    <div className="text-center my-2 text-brand-light">OR</div>
                    <div className="flex items-center justify-center w-full">
                        <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-brand-accent border-dashed rounded-lg cursor-pointer ${secretFiles.length > 0 ? 'bg-green-900/50 border-green-500' : 'bg-brand-primary hover:bg-brand-accent/20'}`}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <FileIcon className="w-8 h-8 mb-2 text-brand-light" />
                                <p className="text-sm text-brand-light">{secretFiles.length > 0 ? `${secretFiles.length} file(s) selected` : 'Upload secret file(s)'}</p>
                            </div>
                            <input type="file" className="hidden" multiple onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                    setSecretFiles(Array.from(e.target.files));
                                    setSecretText('');
                                }
                            }} />
                        </label>
                    </div>
                     {secretFiles.length > 0 && (
                        <div className="mt-4 text-left">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-semibold text-brand-light">Selected Files:</h4>
                                <button onClick={() => setSecretFiles([])} className="text-sm text-red-400 hover:underline">
                                    Clear All
                                </button>
                            </div>
                            <ul className="max-h-24 overflow-y-auto bg-brand-primary p-2 rounded-md border border-brand-accent space-y-1">
                                {secretFiles.map((file, index) => (
                                    <li key={index} className="text-sm text-brand-text truncate px-2" title={file.name}>
                                        {file.name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
                 <div className="p-6 bg-brand-secondary rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-brand-cyan">3. Secure with Password</h3>
                    <div className="relative">
                        <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-light"/>
                        <input
                            type="password"
                            className="w-full p-3 pl-10 bg-brand-primary border border-brand-accent rounded-md focus:ring-2 focus:ring-brand-cyan focus:outline-none transition"
                            placeholder="Enter encryption password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>
                <button 
                    onClick={handleEncode} 
                    disabled={isLoading}
                    className="w-full py-3 text-lg font-bold bg-brand-cyan text-brand-primary rounded-lg hover:bg-sky-400 transition-colors disabled:bg-brand-accent disabled:cursor-not-allowed flex items-center justify-center">
                    {isLoading ? <Loader /> : 'Encode Image'}
                </button>
            </div>
            {/* Output Column */}
            <div className="flex flex-col items-center justify-center p-6 bg-brand-secondary rounded-lg shadow-lg min-h-[300px]">
                {isLoading && <div className="text-center"><Loader /><p className="mt-4">{statusMessage}</p></div>}
                {error && <div className="text-center text-red-400 p-4 border border-red-500 rounded-lg">{error}</div>}
                {resultImageUrl && (
                    <div className="text-center">
                         <h3 className="text-xl font-semibold mb-4 text-green-400">Encoding Successful!</h3>
                        <img src={resultImageUrl} alt="Stego Image" className="max-w-full max-h-96 rounded-md shadow-md" />
                        <a href={resultImageUrl} download="stego-image.png" className="mt-6 inline-flex items-center justify-center px-6 py-3 font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                           <DownloadIcon className="w-5 h-5 mr-2"/> Download Stego Image
                        </a>
                    </div>
                )}
                {!isLoading && !resultImageUrl && !error && (
                    <div className="text-center text-brand-light">
                        <p>Your resulting image will appear here once encoding is complete.</p>
                    </div>
                )}
            </div>
        </div>
    );
    
    const renderDecodePane = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Input Column */}
            <div className="space-y-6">
                <div className="p-6 bg-brand-secondary rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-brand-cyan">1. Stego Image</h3>
                    <ImageDropzone file={stegoImage} onFileChange={setStegoImage} />
                </div>
                <div className="p-6 bg-brand-secondary rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-brand-cyan">2. Enter Password</h3>
                    <div className="relative">
                        <KeyIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-light"/>
                        <input
                            type="password"
                            className="w-full p-3 pl-10 bg-brand-primary border border-brand-accent rounded-md focus:ring-2 focus:ring-brand-cyan focus:outline-none transition"
                            placeholder="Enter decryption password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>
                <button 
                    onClick={handleDecode} 
                    disabled={isLoading}
                    className="w-full py-3 text-lg font-bold bg-brand-cyan text-brand-primary rounded-lg hover:bg-sky-400 transition-colors disabled:bg-brand-accent disabled:cursor-not-allowed flex items-center justify-center">
                    {isLoading ? <Loader /> : 'Decode Image'}
                </button>
            </div>
            {/* Output Column */}
            <div className="flex flex-col items-center justify-center p-6 bg-brand-secondary rounded-lg shadow-lg min-h-[300px]">
                 {isLoading && <div className="text-center"><Loader /><p className="mt-4">{statusMessage}</p></div>}
                {error && <div className="text-center text-red-400 p-4 border border-red-500 rounded-lg">{error}</div>}
                {extractedData && (
                    <div className="text-center w-full">
                         <h3 className="text-xl font-semibold mb-4 text-green-400">Decoding Successful!</h3>
                        {extractedData.type === 'text' && (
                            <div className="w-full p-4 bg-brand-primary border border-brand-accent rounded-md">
                                <h4 className="font-bold text-brand-cyan mb-2">Extracted Message:</h4>
                                <p className="text-left whitespace-pre-wrap break-words">{extractedData.content}</p>
                            </div>
                        )}
                        {extractedData.type === 'files' && (
                            <div className="w-full p-4 bg-brand-primary border border-brand-accent rounded-md text-left">
                                <h4 className="font-bold text-brand-cyan mb-3">Extracted Files:</h4>
                                <ul className="space-y-3 max-h-60 overflow-y-auto">
                                    {extractedData.files.map((file, index) => (
                                        <li key={index} className="flex items-center justify-between bg-brand-secondary p-2 rounded-md">
                                            <span className="text-sm text-brand-text truncate mr-4 flex-1" title={file.name}>{file.name}</span>
                                            <a href={file.dataUrl} download={file.name} className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors whitespace-nowrap">
                                                <DownloadIcon className="w-4 h-4 mr-2"/> Download
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
                {!isLoading && !extractedData && !error && (
                     <div className="text-center text-brand-light">
                        <p>Your extracted data will appear here once decoding is complete.</p>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-brand-primary flex flex-col items-center p-4 sm:p-6 md:p-8">
            <header className="w-full max-w-6xl mx-auto text-center mb-8">
                <h1 className="text-4xl sm:text-5xl font-bold text-white">Steganography <span className="text-brand-cyan">Studio</span></h1>
                <p className="text-lg text-brand-light mt-2">Hide your secrets in plain sight with AES-encrypted steganography.</p>
            </header>
            <main className="w-full max-w-6xl mx-auto bg-brand-secondary/50 rounded-xl shadow-2xl p-4 sm:p-8">
                <div className="flex justify-center border-b border-brand-accent mb-8">
                    <button 
                        onClick={() => handleModeChange('encode')} 
                        className={`px-6 py-3 text-lg font-medium transition-colors ${mode === 'encode' ? 'border-b-2 border-brand-cyan text-brand-cyan' : 'text-brand-light hover:text-white'}`}>
                        Encode
                    </button>
                    <button 
                        onClick={() => handleModeChange('decode')} 
                        className={`px-6 py-3 text-lg font-medium transition-colors ${mode === 'decode' ? 'border-b-2 border-brand-cyan text-brand-cyan' : 'text-brand-light hover:text-white'}`}>
                        Decode
                    </button>
                </div>
                {mode === 'encode' ? renderEncodePane() : renderDecodePane()}
            </main>
            <footer className="text-center mt-8 text-brand-light text-sm">
                <p>Built with React & TypeScript. For educational purposes only.</p>
            </footer>
        </div>
    );
};

export default App;
