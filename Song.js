// Song 'class'

// const Queue = require('./queue');

/**
 * @typedef {import('./Queue.js')} Queue
 */
const DiscordVoice = require('@discordjs/voice');
const crypto = require("node:crypto");

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

        this.name = "NoQueueError";
        this.descriptor = "No queue set, failed to run queue action";
        this.action = action;
        this.date = new Date();
    }
}

class Song {
    /**
     * The song ID (UUID).
     * @type {string}
     */
    Id;

    /**
     * Title of the song
     * @type {string}
     */
    Title;

    /**
     * Loop song?
     * @type {boolean}
     */
    Repeat;

    /**
     * 
     * @type {Queue}
     */
    Queue;

    /**
     * If true, the song is removed from the queue after playing (play-next feature)
     * @type {boolean}
     */
    Temporary;

    /**
     * Metadata for the song (track time, position, author, album)
     * @type {Metadata} 
     */
    Metadata = {};

    /**
     * Song metadata
     * @typedef {Object} Metadata
     * @property {string} Artist - The artist
     * @property {string} [Album] - Album the song belongs to
     * @property {number} [Duration] - Duration of song in MS
     * @property {number} [Year] - The release year of the track (optional)
     * @property {number} AddedByUserId - The Discord ID of the user that added this song 
     */

     /**
      * @typedef {Object} PersistentData
      * @property {string} [URL] - URL pointing to where the song can be found online
      * @property {string} [Description] - Additional information displayed with the song details (Under the _title_, _artist_, and user that added the song)
      */

     /**
      * @typedef {Object} PluginData
      * @property {string} PluginPackageName - The package name of the plugin that created this song. (Used to retrieve this song's StreamData)
      * @property {string} MethodName - The name of the method called to retrieve a song's StreamData. We obtain the plugin's API using the PluginPackageName, then call _this_ method passing the song as parameter one.
      * @property {PersistentData} [PersistentData] - Additional data to keep with the song (must be data that can be stringifying using JSON, so string, numbers, boolean, etc. Other than that we don't care)
      */

    /**
     * Plugin that created the song's data
     * @type {PluginData}
     */
    PluginData;

    /**
     * 
     * @type {DiscordVoice.AudioResource}
     */
    AudioResource;

    /**
     * Creates a new Song object
     * 
     * @param {string} title - The title of the song. Can also be the stringifying version of a song object. _If you're doing that, everything else **must** be undefined_
     * @param {Metadata} metadata - Meta data of the song
     * @param {PluginData} pluginData - Data that is to find the author plugin of this song, (so we can get the StreamData and audio info)
     * @param {Queue} [queue = undefined] - The queue we're apart of
     * @param {boolean} [isTemporary = false] - Whether or not the song is temporary, (removed after being played once)
     * 
     */
    constructor(title, metadata, pluginData, queue, isTemporary) {
        if ((typeof title === "string" || typeof title == "object" ) && (metadata == undefined && pluginData == undefined && queue == undefined && isTemporary == undefined)) {
            // attempt to load via FromString() or FromJson()?
            if (typeof title === "string")
                this.FromString(title);
            else if (typeof title === "object")
                this.FromJson(title);

        } else {
            if (typeof Queue === "object")
                this.Queue = Queue;

            if (typeof title !== "string")
                throw new TypeError("title expected string got " + (typeof title).toString());
            if (typeof metadata !== "object")
                throw new TypeError("metadata expected object got " + (typeof metadata).toString());
            if (typeof pluginData !== "object")
                throw new TypeError("pluginData expected object got " + (typeof pluginData).toString());
            if (typeof pluginData.PluginPackageName !== "string")
                throw new TypeError("pluginData.PluginPackageName expected string got " + (typeof pluginData.PluginPackageName).toString());
            if (typeof pluginData.MethodName !== "string")
                throw new TypeError("pluginData.MethodName expected string got " + (typeof pluginData.MethodName).toString());


            this.Title = title;
            this.Metadata = metadata;
            this.Temporary = isTemporary;
            this.PluginData = pluginData;
            this.Id = crypto.randomUUID();
        }
    }

    /**
     * Gets the ReadableStream or string from the author plugin.
     * 
     * We call the author plugin's .PlaySong(this) method (if not method name exists in PluginData) and expect a ReadableStream or string back. This is the output of this function.
     * 
     * The Queue class will then create a new AudioResource using this data.
     * 
     * @return {ReadableStream|string} The resource passed to VoiceConnection.play()
     */
    GetStreamData() {
        let MethodName = "PlaySong";
        if (typeof PluginData == "object") // not null
            if (typeof PluginData.MethodName == "string") // exists
                if (PluginData.MethodName.replace(" ","") != "") // is not empty
                    MethodName = PluginData.MethodName.replace(" ","");


        let func = process.Bismo.GetPluginMethod(this.PluginData.PluginPackageName, MethodName, true);
        if (func == undefined && MethodName != "PlaySong")
            func = process.Bismo.GetPluginMethod(this.PluginPackageName, "PlaySong", true);

        if (typeof func == "function")
            return func(this);
        else
            return undefined; // cool, okay, whatever
    }

    
    /**
     * Plays the song
     * 
     * Calls Queue.Play(this)
     * The method Queue.Play() grabs the stream data from this.GetStreamData()
     * 
     */
    Play() {
        if (this.Queue != undefined)
            this.Queue.Play(this);
        else
            throw new NoQueueError('Play');
    }

    /**
     * Pause the song (if playing)
     */
    Pause() {
        if (this.Queue != undefined)
            this.Queue.Pause(this);
        else
            throw new NoQueueError('Pause');
    }

    /**
     * Skip the song (if playing)
     */
    Skip() {
        if (Queue != undefined)
            this.Queue.Next(this);
        else
            throw new NoQueueError('Skip');
    }

    /**
     * Mark the song as repeat
     */
    Repeat(bool) {
        if (this.IsPlaying())
            this.Queue.Repeat = 1;

        return this.Rpeat
    }

    /**
     * Remove this song from the queue 
     */
    Remove() {
        if (this.Queue != undefined)
            this.Queue.Remove(this);
    }


    /**
     * Seek song to position
     * @param {number} time - Time to skip to in seconds
     */
    // Seek(time) {
    //     if (this.IsPlaying() && typeof time == "number")
    //         // uhh
    //     else
    //         throw new NoQueueError('Seek');
    // }

    /**
     * If this Song is currently playing in the queue
     * @return {boolean} Song is playing or not
     */
    IsPlaying() {
        if (this.Queue != undefined) {
            if (this.Queue.CurrentSong != undefined)
                return this.Queue.CurrentSong.Id == this.Id;
        }

        return false;
    }

    /**
     * Returns song as JSON object
     * 
     * @return {Object} Sterile Song object
     */
    ToJSON() {
        return {
            Title: this.Title,
            Id: this.Id,
            Repeat: this.Repeat,
            Temporary: this.Temporary,
            PluginData: this.PluginData,
        }
    }

    /**
     * Stringify the JSON object
     * @return {string} Sterile Song object
     */
    ToString() {
        return JSON.stringify(this.ToJSON());
    }

    /**
     * Load Song from Object
     * @param {Object} data - Sterile song data
     * @param {Queue} [queue] - The queue this song belongs to
     */
    FromJson(data, queue) {
        if (typeof data !== "object")
            throw new TypeError("data expected object got " + (typeof data).toString());

        if (typeof data.Id !== "string" || typeof data.Id !== "number")
            throw new TypeError("data.Id expected string or number, got " + (typeof data.Id).toString());
        data.OriginalId = data.Id;

        if (typeof data.Title !== "string")
            throw new TypeError("data.Title expected string got " + (typeof data.Title).toString());
        
        if (typeof data.PluginData !== "object")
            throw new TypeError("data.PluginData expected object got " + (typeof data.PluginData).toString());
        else {
            if (typeof data.PluginData.PluginPackageName !== "string")
                throw new TypeError("data.PluginData.PluginPackageName expected string got " + (typeof data.PluginData.PluginPackageName).toString());
            if (typeof data.PluginData.MethodName !== "string")
                throw new TypeError("data.PluginData.MethodName expected string got " + (typeof data.PluginData.MethodName).toString());
        }

        if (typeof data.Repeat !== "boolean")
            data.Repeat = false;
        if (typeof data.Temporary !== "boolean")
            data.Temporary = false;

        // okay we should be 'ight

        this.Id = data.Id;
        this.Queue = queue;
        this.Title = data.Title;
        this.Repeat = data.Repeat;
        this.Temporary = data.Temporary;
        this.OriginalId = data.OriginalId;
        this.PluginData = data.PluginData;

    }

    /**
     * Load Song from string
     * @param {string} data - Stringified song data
     * @param {Queue} [queue] - The queue this song belongs to
     */
    FromString(data, queue) {
        if (typeof data !== "string")
            throw new TypeError("data expected string got " + (typeof data).toString());

        data = JSON.parse(data);

        FromJson(data, queue);
    }



}

// module.exports = function(bismo) {
    // Bismo = bismo;
    // return Song;
// }

module.exports = Song;