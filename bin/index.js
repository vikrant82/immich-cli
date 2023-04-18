#! /usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const fdir_1 = require("fdir");
const si = __importStar(require("systeminformation"));
const readline = __importStar(require("readline"));
const moment = require("moment");
const momenttz = require("moment-timezone");
const getVideoDurationInSeconds = require('get-video-duration')
const path = __importStar(require("path"));
const form_data_1 = __importDefault(require("form-data"));
const cliProgress = __importStar(require("cli-progress"));
const promises_1 = require("fs/promises");
// GLOBAL
const mime = __importStar(require("mime-types"));
const exifReader = __importStar(require('exifreader'));
const chalk_1 = __importDefault(require("chalk"));
const package_json_1 = __importDefault(require("../package.json"));
const p_limit_1 = __importDefault(require("p-limit"));
const log = console.log;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
let errorAssets = [];
const SUPPORTED_MIME = [
    // IMAGES
    'image/heif',
    'image/heic',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/dng',
    'image/x-adobe-dng',
    'image/webp',
    'image/tiff',
    'image/nef',
    'image/x-nikon-nef',
    // VIDEO
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/3gpp',
];
commander_1.program.name('immich').description('Immich command line interface').version(package_json_1.default.version);
commander_1.program
    .command('upload')
    .description('Upload assets to an Immich instance')
    .usage('upload [options] <paths...>')
    .addOption(new commander_1.Option('-k, --key <value>', 'API Key').env('IMMICH_API_KEY'))
    .addOption(new commander_1.Option('-s, --server <value>', 'Immich server address (http://<your-ip>:2283/api or https://<your-domain>/api)').env('IMMICH_SERVER_ADDRESS'))
    .addOption(new commander_1.Option('-r, --recursive', 'Recursive').env('IMMICH_RECURSIVE').default(false))
    .addOption(new commander_1.Option('-y, --yes', 'Assume yes on all interactive prompts').env('IMMICH_ASSUME_YES'))
    .addOption(new commander_1.Option('-da, --delete', 'Delete local assets after upload').env('IMMICH_DELETE_ASSETS'))
    .addOption(new commander_1.Option('-t, --threads <num>', 'Amount of concurrent upload threads (default=5)').env('IMMICH_UPLOAD_THREADS'))
    .addOption(new commander_1.Option('-al, --album [album]', 'Create albums for assets based on the parent folder or a given name').env('IMMICH_CREATE_ALBUMS'))
    .addOption(new commander_1.Option('-id, --device-uuid <value>', 'Set a device UUID').env('IMMICH_DEVICE_UUID'))
    .addOption(new commander_1.Option('-d, --directory <value>', 'Upload assets recurisvely from the specified directory (DEPRECATED, use path argument with --recursive instead)').env('IMMICH_TARGET_DIRECTORY'))
    .argument('[paths...]', 'One or more paths to assets to be uploaded')
    .action((paths, options) => {
    if (options.directory) {
        if (paths.length > 0) {
            log(chalk_1.default.red("Error: Can't use deprecated --directory option when specifying paths"));
            process.exit(1);
        }
        if (options.recursive) {
            log(chalk_1.default.red("Error: Can't use deprecated --directory option together with --recursive"));
            process.exit(1);
        }
        log(chalk_1.default.yellow('Warning: deprecated option --directory used, this will be removed in a future release. Please specify paths with --recursive instead'));
        paths.push(options.directory);
        options.recursive = true;
    }
    else {
        if (paths.length === 0) {
            // If no path argument is given, check if an env variable is set
            const envPath = process.env.IMMICH_ASSET_PATH;
            if (!envPath) {
                log(chalk_1.default.red('Error: Must specify at least one path'));
                process.exit(1);
            }
            else {
                paths = [envPath];
            }
        }
    }
    upload(paths, options);
});
commander_1.program.parse(process.argv);
function upload(paths, { key, server, recursive, yes: assumeYes, delete: deleteAssets, uploadThreads, album: createAlbums, deviceUuid: deviceUuid, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const endpoint = server;
        const deviceId = deviceUuid || (yield si.uuid()).os || 'CLI';
        const osInfo = (yield si.osInfo()).distro;
        var localAssets = [];
        const localAssetNames = [];
        const uploadedAssets = [];
        // Ping server
        log('Checking connectivity with Immich instance...');
        yield pingServer(endpoint);
        // Login
        log('Checking credentials...');
        const user = yield validateConnection(endpoint, key);
        log(chalk_1.default.green(`Successful authentication for user ${user.email}`));
        // Index provided directory
        log('Indexing local assets...');
        let crawler = new fdir_1.fdir().withFullPaths();
        if (!recursive) {
            // Don't go into subfolders
            crawler = crawler.withMaxDepth(0);
        }
        const files = [];
        for (const newPath of paths) {
            try {
                // Check if the path can be accessed
                fs.accessSync(newPath);
            }
            catch (e) {
                log(chalk_1.default.red(e));
                process.exit(1);
            }
            const stats = fs.lstatSync(newPath);
            if (stats.isDirectory()) {
                // Path is a directory so use the crawler to crawl it (potentially very large list)
                const children = crawler.crawl(newPath).sync();
                for (const child of children) {
                    files.push(child);
                }
            }
            else {
                // Path is a single file
                files.push(path.resolve(newPath));
            }
        }
        // Ensure that list of files only has unique entries
        const uniqueFiles = new Set(files);
        log(`Total, found ${files.length} local assets`);
        for (const filePath of uniqueFiles) {
            const mimeType = mime.lookup(filePath);
            const fileStat = fs.statSync(filePath);
            if (SUPPORTED_MIME.includes(mimeType) 
            && !filePath.includes("-WA") 
            && !filePath.includes("Screenshot")
            && fileStat.size > 25000) {
                localAssets.push({
                    id: `${path.basename(filePath)}-${fileStat.size}`.replace(/\s+/g, ''),
                    filePath,
                });
                localAssetNames.push(path.basename(filePath));
            }
        }
        if (localAssets.length == 0) {
            log('No local assets found, exiting');
            process.exit(0);
        }
        log(`Indexing complete, found ${localAssets.length} local assets`);
        log('Comparing local assets with those on the Immich instance on file names...');
        const backupAsset = yield getAssetInfoFromServer(endpoint, key, deviceId);
        for (var lasset in localAssetNames) {
            for (var basset in backupAsset) {
                var extIndex = localAssetNames[lasset].indexOf(".");
                if (localAssetNames[lasset].includes("-edit")) {
                    extIndex = localAssetNames[lasset].indexOf("-edit");
                }
                if (localAssetNames[lasset].includes("_COV")) {
                    extIndex = localAssetNames[lasset].indexOf("_COV");
                }
                if (extIndex >= 3 && // Skip 3 or less lengths
                    backupAsset[basset].originalPath.includes(localAssetNames[lasset].substring(0, extIndex))) {
                    uploadedAssets.push({
                        id: localAssets[lasset].id,
                        filePath: localAssets[lasset].filePath,
                        serverInfo: backupAsset[basset]
                    });
                }
            }
        }

        log(chalk_1.default.green(`Found a potential total of ${uploadedAssets.length} assets already uploaded.`));
        if (localAssets.length == 0) {
            log(chalk_1.default.green('All assets have been backed up to the server'));
            process.exit(0);
        }
        else {
            log(chalk_1.default.green(`A total of ${localAssets.length} assets will be checked for upload to the server`));
        }
        if (createAlbums) {
            log(chalk_1.default.green(`A total of ${localAssets.length} assets will be added to album(s).\n` +
                'NOTE: some assets may already be associated with the album, this will not create duplicates.'));
        }
        // Ask user
        try {
            //There is a promise API for readline, but it's currently experimental
            //https://nodejs.org/api/readline.html#promises-api
            /*const answer = assumeYes
                ? 'y'
                : yield new Promise((resolve) => {
                    rl.question('Do you want to start upload now? (y/n) ', resolve);
                });*/
            const answer = 'y';
            const deleteLocalAsset = deleteAssets ? 'y' : 'n';
            if (answer == 'n') {
                log(chalk_1.default.yellow('Abort Upload Process'));
                process.exit(1);
            }
            var skippedFiles = []
            if (answer == 'y') {
                log(chalk_1.default.green('Start uploading...'));
                /*const progressBar = new cliProgress.SingleBar({
                    format: 'Upload Progress | {bar} | {percentage}% || {value}/{total} || Current file [{filepath}]',
                }, cliProgress.Presets.shades_classic);
                progressBar.start(localAssets.length, 0, { filepath: '' });*/
                const assetDirectoryMap = new Map();
                const uploadQueue = [];
                var uploaded = 0;
                const limit = (0, p_limit_1.default)(uploadThreads !== null && uploadThreads !== void 0 ? uploadThreads : 5);
                var total = 0;
                for (const asset of localAssets) {
                    const album = asset.filePath.split(path.sep).slice(-2)[0];
                    if (!assetDirectoryMap.has(album)) {
                        assetDirectoryMap.set(album, []);
                    }
                    if (total++ % 500 == 0) {
                        log(chalk_1.default.green(`Done ${total} of ${localAssets.length}`));
                    }
                    const skip = yield skipUpload(uploadedAssets, asset)
                    if (!skip) {
                        // New file, lets upload it!
                        uploadQueue.push(limit(() => __awaiter(this, void 0, void 0, function* () {
                            try {
                                // TODO
                                const res = yield startUpload(endpoint, key, asset, deviceId);
                                //.increment(1, { filepath: asset.filePath });
                                if (res && (res.status == 201 || res.status == 200)) {
                                    if (deleteLocalAsset == 'y') {
                                        fs.unlink(asset.filePath, (err) => {x``
                                            if (err) {
                                                log(err);
                                                return;
                                            }
                                        });
                                    }
                                    assetDirectoryMap.get(album).push(res.data?.id);
                                }
                                if (res?.data?.duplicate) {
                                    skippedFiles.push(asset.filePath);
                                } else {
                                    log(chalk_1.default.green(`Uploading: ${asset.filePath}. Done ${uploaded} of ${localAssets.length}`));
                                    uploaded++;
                                }
                            }
                            catch (err) {
                                log(chalk_1.default.red(err.message));
                            }
                        })));
                    }
                    else if (createAlbums) {
                        // Existing file. No need to upload it BUT lets still add to Album.
                        uploadQueue.push(limit(() => __awaiter(this, void 0, void 0, function* () {
                            try {
                                // Fetch existing asset from server
                                const res = yield axios_1.default.post(`${endpoint}/asset/check`, {
                                    deviceAssetId: asset.id,
                                    deviceId,
                                }, {
                                    headers: { 'x-api-key': key },
                                });
                                assetDirectoryMap.get(album).push(res.data.id);
                            }
                            catch (err) {
                                log(chalk_1.default.red(err.message));
                            }
                        })));
                    } else {
                        skippedFiles.push(asset.filePath);
                    }
                }
                const uploads = yield Promise.all(uploadQueue);
                //progressBar.stop();
                if (createAlbums) {
                    log(chalk_1.default.green('Creating albums...'));
                    const serverAlbums = yield getAlbumsFromServer(endpoint, key);
                    if (typeof createAlbums === 'boolean') {
                        //progressBar.start(assetDirectoryMap.size, 0);
                        for (const localAlbum of assetDirectoryMap.keys()) {
                            const serverAlbumIndex = serverAlbums.findIndex((album) => album.albumName === localAlbum);
                            let albumId;
                            if (serverAlbumIndex > -1) {
                                albumId = serverAlbums[serverAlbumIndex].id;
                            }
                            else {
                                albumId = yield createAlbum(endpoint, key, localAlbum);
                            }
                            if (albumId) {
                                yield addAssetsToAlbum(endpoint, key, albumId, assetDirectoryMap.get(localAlbum));
                            }
                            //progressBar.increment();
                        }
                        //progressBar.stop();
                    }
                    else {
                        const serverAlbumIndex = serverAlbums.findIndex((album) => album.albumName === createAlbums);
                        let albumId;
                        if (serverAlbumIndex > -1) {
                            albumId = serverAlbums[serverAlbumIndex].id;
                        }
                        else {
                            albumId = yield createAlbum(endpoint, key, createAlbums);
                        }
                        yield addAssetsToAlbum(endpoint, key, albumId, Array.from(assetDirectoryMap.values()).flat());
                    }
                }
                log(chalk_1.default.yellow(`Failed to upload ${errorAssets.length} files `), errorAssets);
                log(chalk_1.default.green(`Skipped: ${skippedFiles.length} files`));
                log(chalk_1.default.green(`Uploaded: ${uploaded} files`));
                //skippedFiles.forEach(file => log(chalk_1.default.green(`Skipped: ${file}`)));
                if (errorAssets.length > 0) {
                    process.exit(1);
                }
                process.exit(0);
            }
        }
        catch (e) {
            log(chalk_1.default.red('Error reading input from user '), e);
            process.exit(1);
        }
    });
}
function skipUpload(uploadedAssets, asset) {
    return __awaiter(this, void 0, void 0, function* () {
        if (mime.lookup(asset.filePath).includes('gif')) {
            // Skip gifs
            return true;
        }
        var match = false;
        var index = findIndexes(uploadedAssets, asset)
        //log(chalk_1.default.green(`Reading exif for: ${asset.filePath}`));
        const localTags = getAssetType(asset.filePath) === 'IMAGE' ? yield getExif(asset): yield getDuration(asset);
        for (var i in index) {
            const serverInfo = uploadedAssets[index[i]].serverInfo;
            match = compareLocalWithServerExif(serverInfo, localTags, getAssetType(asset.filePath));
            if (match) break;
        }
        return match;
    });
}

function findIndexes(uploadedAssets, asset) {
    var index = []
    uploadedAssets.forEach ( (value, i) => { 
        if (value.id === asset.id) {
            index.push(i);
        }
    });
    return index;
}

function compareLocalWithServerExif(serverInfo, localTags, assetType) {
    if (assetType === 'IMAGE') {
        try {
            var matchingDateTimeOrig = true;//compareOrigDate(serverInfo, localTags)
            //var exifHeight = localTags.hasOwnProperty('PixelXDimension') ? serverInfo.exifInfo.exifImageWidth === localTags['PixelXDimension'].value : true;
            //var exifWidth = localTags.hasOwnProperty('PixelYDimension') ? serverInfo.exifInfo.exifImageHeight === localTags['PixelYDimension'].value : true;
            var model = localTags.hasOwnProperty('Model') && serverInfo.exifInfo.model != null ? serverInfo.exifInfo.model.trim() === localTags.Model.description.trim() : true;
            var make = localTags.hasOwnProperty('Make') && serverInfo.exifInfo.make != null ? serverInfo.exifInfo.make.trim() === localTags.Make.description.trim() : true;
            var exp = exposureTime(serverInfo, localTags);
            var iso = localTags.hasOwnProperty('ISOSpeedRatings') && localTags.ISOSpeedRatings.description != 0 
            && serverInfo.exifInfo.iso != null ? serverInfo.exifInfo.iso === localTags.ISOSpeedRatings.description : true;
            var fnumber = comparefNumber(serverInfo, localTags);
            var flength = comparefLength(serverInfo, localTags);
            if (!( matchingDateTimeOrig  && model && make && exp && iso && fnumber && flength)) {
                //log(chalk_1.default.green(`Skipped after comparison" ${serverInfo.originalPath} as ${matchingDateTimeOrig},${model},${make},${exp},${iso},${fnumber},${flength}`));
            }
            return (
                matchingDateTimeOrig  && model && make && exp && iso && fnumber && flength
            );
        } catch (e) {
            log(chalk_1.default.red('Skipping because of error: '), e);
            return false;
        }
    } else {
        var exifDuration = Math.round(moment.duration(serverInfo.duration).asSeconds() * 10)/10;
        if ( Math.abs(eval(exifDuration - Math.round(localTags * 10)/10)) * 100 / exifDuration < 20) {
            return true;
        }
        return false;
    }
}

function exposureTime(serverInfo, localTags) {
    if (localTags.hasOwnProperty('ExposureTime') && serverInfo.exifInfo.exposureTime != null) {
        var expL = 0;
        var expDes;
        if ( serverInfo.exifInfo.exposureTime === localTags.ExposureTime.description) {
            return true;
        }
        expDes = Math.round(eval(localTags.ExposureTime.description)*10)/10;
        if (localTags.ExposureTime.value.length == 2) {
            expL = Math.round(localTags.ExposureTime.value[0] / localTags.ExposureTime.value[1] * 1000)/1000;
        } else {
            expL = Math.round (eval (localTags.ExposureTime.value) * 10) /10;
            
        }
        return  Math.round(eval(serverInfo.exifInfo.exposureTime)*100)/100 === expL
                || Math.round(eval(serverInfo.exifInfo.exposureTime)*100)/100 === expDes;
    }
    return true;
}

function comparefLength(serverInfo, localTags) {
    if (localTags.hasOwnProperty('FocalLength') && serverInfo.exifInfo.focalLength != null) {
        var localLRound = 0, localLfloor = 0;
        if (localTags.FocalLength.value.length == 2) {
            localLRound = Math.round(localTags.FocalLength.value[0] / localTags.FocalLength.value[1] * 10)/10;
            localLfloor = Math.floor(localTags.FocalLength.value[0] / localTags.FocalLength.value[1] * 10)/10;
        } else {
            localLRound =  Math.round( eval (localTags.FocalLength.value) * 10)/10;
            localLfloor =  Math.floor( eval (localTags.FocalLength.value) * 10)/10;
            //log(chalk_1.default.green(`local focal length not in expected format`));
        }
        return  serverInfo.exifInfo.focalLength === localLRound || serverInfo.exifInfo.focalLength === localLfloor;
    }
    return true;
}

function comparefNumber(serverInfo, localTags) {
    if (localTags.hasOwnProperty('FNumber') && serverInfo.exifInfo.fNumber != null) {
        var localN = 0;
        if (localTags.FNumber.value.length == 2) {
            localN = Math.round(localTags.FNumber.value[0] / localTags.FNumber.value[1] * 10)/10;
        } else {
            localN = Math.round(eval (localTags.FNumber.value) * 10)/10;
            //log(chalk_1.default.green(`local focal number not in expected format`));
        }
        return  serverInfo.exifInfo.fNumber === localN;
    }
    return true;
}

function compareOrigDate(serverInfo, localTags) {
    if (localTags.hasOwnProperty('DateTimeOriginal')) {
        // Try with local:
        momenttz.tz.setDefault("GMT")
        var timeGMT = moment(localTags['DateTimeOriginal'].description, ['YYYY:MM:DD hh:mm:ss', "YYYY:MM:DD hh:mm:ss.SSS'Z'", "YYYY-MM-DDThh:mm:ss+SS:SS"]).toDate();
        momenttz.tz.setDefault("IST")
        var timeIST = moment(localTags['DateTimeOriginal'].description, ['YYYY:MM:DD hh:mm:ss', "YYYY:MM:DD hh:mm:ss.SSS'Z'", "YYYY-MM-DDThh:mm:ss+SS:SS"]).toDate();
        momenttz.tz.setDefault(serverInfo.exifInfo.timeZone)
        var timeLocal = moment(localTags['DateTimeOriginal'].description, ['YYYY:MM:DD hh:mm:ss', "YYYY:MM:DD hh:mm:ss.SSS'Z'", "YYYY-MM-DDThh:mm:ss+SS:SS"]).toDate();
        var timeServer = moment(serverInfo.exifInfo.dateTimeOriginal, "YYYY-MM-DDThh:mm:ss.SSS'Z'").toDate()
        return (timeServer.toISOString() === timeIST.toISOString() || timeServer.toISOString() === timeGMT.toISOString() || timeServer.toISOString() === timeLocal.toISOString());
    }
    return true;
}

function getExif(asset) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return exifReader.load(asset.filePath);
        } catch (e) {
            log(chalk_1.default.red(`Error getting exif for: ${asset.filePath}`), e);
            process.exit(1);
        }
    });
}

function getDuration(asset) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return getVideoDurationInSeconds.default(asset.filePath);
        } catch (e) {
            log(chalk_1.default.red('Error getting exif'), e);
            process.exit(1);
        }
    });
}

function startUpload(endpoint, key, asset, deviceId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const assetType = getAssetType(asset.filePath);
            const fileStat = yield (0, promises_1.stat)(asset.filePath);
            const data = new form_data_1.default();
            data.append('deviceAssetId', asset.id);
            data.append('deviceId', deviceId);
            data.append('assetType', assetType);
            // This field is now deprecatd and we'll remove it from the API. Therefore, just set it to mtime for now
            data.append('fileCreatedAt', fileStat.mtime.toISOString());
            data.append('fileModifiedAt', fileStat.mtime.toISOString());
            data.append('isFavorite', JSON.stringify(false));
            data.append('fileExtension', path.extname(asset.filePath));
            data.append('duration', '0:00:00.000000');
            data.append('assetData', fs.createReadStream(asset.filePath));
            const config = {
                method: 'post',
                maxRedirects: 0,
                url: `${endpoint}/asset/upload`,
                headers: Object.assign({ 'x-api-key': key }, data.getHeaders()),
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                data: data,
            };
            // TODO
            const res = yield (0, axios_1.default)(config);
            return res;
        }
        catch (e) {
            errorAssets.push({
                file: asset.filePath,
                reason: e,
                response: (_a = e.response) === null || _a === void 0 ? void 0 : _a.data,
            });
            return null;
        }
    });
}
function getAlbumsFromServer(endpoint, key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield axios_1.default.get(`${endpoint}/album`, {
                headers: { 'x-api-key': key },
            });
            return res.data;
        }
        catch (e) {
            log(chalk_1.default.red('Error getting albums'), e);
            process.exit(1);
        }
    });
}
function createAlbum(endpoint, key, albumName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield axios_1.default.post(`${endpoint}/album`, { albumName }, {
                headers: { 'x-api-key': key },
            });
            return res.data.id;
        }
        catch (e) {
            log(chalk_1.default.red(`Error creating album '${albumName}'`), e);
        }
    });
}
function addAssetsToAlbum(endpoint, key, albumId, assetIds) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield axios_1.default.put(`${endpoint}/album/${albumId}/assets`, { assetIds: [...new Set(assetIds)] }, {
                headers: { 'x-api-key': key },
            });
        }
        catch (e) {
            log(chalk_1.default.red('Error adding asset to album'), e);
        }
    });
}
function getAssetInfoFromServer(endpoint, key, deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield axios_1.default.get(`${endpoint}/asset`, {
                headers: { 'x-api-key': key },
            });
            return res.data;
        }
        catch (e) {
            log(chalk_1.default.red("Error getting device's uploaded assets"));
            process.exit(1);
        }
    });
}
function pingServer(endpoint) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield axios_1.default.get(`${endpoint}/server-info/ping`);
            if (res.data['res'] == 'pong') {
                log(chalk_1.default.green('Server status: OK'));
            }
        }
        catch (e) {
            log(chalk_1.default.red('Error connecting to server - check server address and port'));
            process.exit(1);
        }
    });
}
function validateConnection(endpoint, key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield axios_1.default.get(`${endpoint}/user/me`, {
                headers: { 'x-api-key': key },
            });
            if (res.status == 200) {
                log(chalk_1.default.green('Login status: OK'));
                return res.data;
            }
        }
        catch (e) {
            log(chalk_1.default.red('Error logging in - check api key'));
            process.exit(1);
        }
    });
}
function getAssetType(filePath) {
    const mimeType = mime.lookup(filePath);
    return mimeType.split('/')[0].toUpperCase();
}
