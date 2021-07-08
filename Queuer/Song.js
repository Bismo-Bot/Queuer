// Song 'class'

const Queue = require('./queue');

// const Bismo;

/**
 * Thrown when we attempt to modify a queue but have no queue parent set for the song
 * (We try to play the song but do not have a queue to play on)
 * 
 */
class NoQueueError extends Error {
    constructor(action = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoQueueError);
        }

        this.nmae = "NoQueueError";
        this.descriptor = "No queue set, failed to run queue action";
        this.action = action;
        this.date = new Date();
    }
}

class Song {
    /**
     * The song ID (auto filled by Queuer)
     * @type {number}
     */
    id;

    /**
     * Title of the song
     * @type {string}
     */
    title;

    /**
     * 
     * @type {Queue}
     */
    queue;

    /**
     * If true, the song is removed from the queue after playing (play-next feature)
     * @type {boolean}
     */
    temporary;

    /**
     * Metadata for the song (track time, position, author, album)
     * @type {Metadata} 
     */
    metaData = {};

    /**
     * Song metadata
     * @typedef {Object} Metadata
     * @property {string} artist - The artist
     * @property {string} [album] - Album the song belongs to
     * @property {number} duration - Duration of song in MS
     * @property {number} [year] - The release year of the track (optional)
     * @property {boolean} [repeat = false] - Song on repeat
     * @property {number} addedByID - The Discord ID of the user that added this song
     * 
     * 
     */

    /**
     * Plugin package name that created the song
     * @type {string}
     */
    packageName;

    /**
     * Miscellaneous storage for the author plugin
     * @type {object}
     * @property {string} [playMethod] - Name of the method on the plugin's public API used to obtain stream data for this plugin.
     */
    persistentData;

    /**
     * Creates a new Song object
     * 
     * @param {string} title - The title of the song
     * @param {Metadata} metaData - Meta data of the song
     * @param {string} packageName - Package name of the plugin that created this song
     * @param {object} persistentData - Data that is required by the author plugin and is saved with the song (urls typically, things that assist playing the song).
     * @param {Queue} [queue = undefined] - The queue we're apart of
     * @param {boolean} [temporary = false] - Whether or not the song is temporary, (removed after being played once)
     * 
     */
    constructor(title, metaData, packageName, persistentData, queue, temporary) {
        // todo: type checking
        this.queue = queue;
        this.title = title;
        this.metaData = metaData;
        this.temporary = temporary;
        this.packageName = packageName;
        this.persistentData = persistentData;
    }



    /**
     * Gets the ReadableStream or string from the author plugin.
     * 
     * We call the author plugin's .PlaySong(this) method (if not method name exists in persistentData) and expect a ReadableStream or string back. This is the output of this function
     * 
     * @return {ReadableStream|string} The resource passed to VoiceConnection.play()
     */
    GetStreamData() {
        let methodName = "PlaySong";
        if (typeof persistentData == "object") // not null
            if (typeof persistentData.methodName == "string") // exists
                if (persistentData.methodName.replace(" ","") != "") // is not empty
                    methodName = persistentData.methodName.replace(" ","");


        let func = Bismo.GetPluginMethod(methodName, this.packageName, true);
        if (func == undefined && methodName != "PlaySong")
            func = Bismo.GetPluginMethod("PlaySong", this.packageName, true);

        if (typeof func == "function")
            return func(this);
        else
            return undefined;
    }

    
    /**
     * Plays the song
     * 
     * Calls queue.PlaySong(this)
     * The method queue.PlaySong() grabs the stream data from this.GetStreamData()
     * 
     */
    Play() {
        if (queue != undefined)
            this.queue.Play(this);
        else
            throw new NoQueueError('Play');
    }

    /**
     * Pause the song (if playing)
     */
    Pause() {
        if (queue != undefined)
            this.queue.Pause(this);
        else
            throw new NoQueueError('Pause');
    }

    /**
     * Skip the song (if playing)
     */
    Skip() {
        if (queue != undefined)
            this.queue.SkipSong(this);
        else
            throw new NoQueueError('Skip');
    }

    /**
     * Seek song to position
     * @param {number} time - Time to skip to in seconds
     */
    Seek(time) {
        if (queue != undefined && typeof time == "number")
            this.queue.SeekSong(this, time);
        else
            throw new NoQueueError('Seek');
    }

    /**
     * Returns song as JSON object
     * 
     * @return {JSON} JSONified song
     */
    ToJSON() {
        JSON.stringify({
            id: this.id,
            title: this.title,
            metaData: this.metaData,
            temporary: this.temporary,
            packageName: this.packageName,
            persistentData: this.persistentData,
        })
    }



}

// module.exports = function(bismo) {
//     Bismo = bismo;
//     return Song;
// }

module.exports = Song;