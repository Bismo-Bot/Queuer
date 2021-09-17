// Song 'class'

const Discord = require("discord.js");
const Song = require('./song');//(Bismo);
const EventEmitter = require('events');

class Queue {

    /**
     * The queue ID (typically the guildID + channelID)
     * @type {number}
     */
    id;

    /**
     * The guild we're playing in (or if personal, authorID)
     * @type {string}
     */
    guildID;

    /**
     * @typedef {Discord.VoiceConnection} VoiceConnection
     */
    /**
     * @typedef {Discord.TextChannel} TextChannel
     */
    /**
     * @typedef {Discord.Message} Message
     */
    /**
     * @typedef {Discord.VoiceChannel} VoiceChannel
     */
    /**
     * @typedef {Discord.StreamDispatcher} StreamDispatcher
     */

    /**
     * VoiceConnection object for the voice channel
     * @type {VoiceConnection}
     */
    voiceConnection;

    /**
     * 
     * @type {StreamDispatcher}
     */
    voiceDispatcher;

    /**
     * The ID for the playback message (used to update playback statuses)
     * @type {string}
     */
    playbackMessageID;

    /**
     * The playback message object
     * @type {Message}
     */
    playbackMessage;

    /**
     * Array of song objects
     * @type {Song[]}
     */
    songs;

    /**
     * Playback volume
     * @type {number}
     */
    volume;

    /**
     * Whether or not the queue is currently paused
     * @type {boolean}
     */
    paused;

    /**
     * The currently playing song ID
     * @type {number}
     */
    currentSong;

    /**
     * Shuffle status
     * @type {boolean}
     */
    shuffle;

    /**
     * Queue loop status
     * @type {boolean}
     */
    repeat;

    /**
     * The text channel we're subscribed to (to send updates to / listen to updates)
     * @type {TextChannel}
     */
    textChannel;

    /**
     * The voice channel we're connected to
     * @type {VoiceChannel}
     */
    voiceChannel;


    /**
     * Even listener.
     * 
     * List of events:
     *      finish
     *      play
     *      pause
     *      next
     *      loop    (queue looped)
     *      repeat  (song looped)
     *      previous
     *      removed
     *      destroyed
     * 
     * @type {EventEmitter}
     */
    events = new EventEmitter();



    constructor(data) {

    }

    /**
     * Gets a Song object from its ID
     * @param {number} id - Song's ID
     * @param {number} offset - Offset the found index by this value. So, if you want to find the next song in queue, set this value to '1' and id to the current song.
     * @return {Song} The song object.
     */
    GetSong = function(id, offset) {
        if (this.songs == undefined)
            return undefined;
        if (offset == undefined)
            offset = 0;

        for (var i = 0; i<this.songs.length; i++) {
            if (this.songs[i].id == id) {
                i = i+offset
                if (this.songs.length >= i)
                    return this.songs[this.songs.length-1];
                if (i < 0)
                    return this.songs[0];

                return this.songs[i];
            }
        }
        return undefined;
    }


    /**
     * Joins the voiceChannel and assigns the voiceConnection
     * @return {boolean} Whether or not the voiceConnection was created
     */
    JoinVoiceChannel = async function() {
        if (!this.voiceChannel) {
            throw new NoVoiceChannel("JoinVoiceChannel");
        }
        if (this.voiceChannel.type != "voice" && this.voiceChannel.type != "dm")
            throw new NoVoiceChannel("JoinVoiceChannel");
        if (typeof this.voiceChannel.permissionsFor != "function")
            throw new NoVoiceChannel("JoinVoiceChannel");
        let permissions = this.voiceChannel.permissionsFor(Client.user)
        if (!permissions.has("CONNECT"))
            throw new NoVoiceChannelPermissions("connect");
        if (!permissions.has("SPEAK"))
            throw new NoVoiceChannelPermissions("speak");

        // Okay there should be a joinable voice channel were we can speak in.
        connection = await this.voiceChannel.join();
        this.voiceConnection = connection;
        if (playbackMessageID == undefined) {
            this.CreatePlaybackMessage();
            return true;
        }
        return true;
    }

    CreatePlaybackMessage = async function() {
        // creates the playback message
    }


    /**
     * Begins playing / resumes the queue in the assigned voice channel. IF no VoiceConnection is available we try and reconnect to the voiceChannel, if none is provided we do not start playing.
     * 
     * Moves the queue to the provided song and plays it
     * 
     * @param {Song} [song] - The song to begin playing
     * 
     * @throws {NoVoiceConnection}
     * @throws {NoVoiceChannel}
     * @throws {NoVoiceChannelPermissions}
     * @throws {NoSuchSong}
     */
    Play(song) {
        // First check if we are in a VC and have a voiceConnection
        if (this.voiceConnection == undefined) {
            // try and connect to the vc?
            if (this.JoinVoiceChannel() != true) {
                throw new NoVoiceConnection("Play", "No voiceChannel available.");
            }
        } else if (this.voiceConnection.status == 4) {
            // Disconnected.
            if (this.JoinVoiceChannel() != true) {
                throw new NoVoiceConnection("Play", "No voiceChannel available.");
            }
        }

        // Okay we're in a VC, play
        if (song == undefined) {
            // Just a simple PLAY
            song = GetSong(this.currentSong);
        }

        if (song == undefined) 
            throw new NoSuchSong(this.currentSong);

        let stream = song.GetStreamData();
        if (stream == undefined)
            throw new NoSuchSong(this.currentSong, "Invalid stream data.");

        this.currentSong = song.id; // Update queue play head

        this.dispatcher = voiceConnection.play(stream).on('finish', ()=> {
            this.voiceConnection.setSpeaking(0);
            events.emit('finish');
        });


        this.dispatcher.setVolume(this.volume/100);

        console.log("Playing queue " + this.id + ". Song ID " + this.currentSong);
        this.UpdatePlaybackMessage();

    }

    /**
     * Pauses the queue
     * (If song is provided then the queue is only paused if that song is playing)
     * @param {Song | number} [song] - The song to begin playing
     */
    Pause(song) {
        if (song == undefined) {
            song = this.currentSong;
        } else {
            if (typeof song == "number") {
                song = song;
            } else {
                song = song.id;
            }
        }

        if (song == this.currentSong) {
            this.dispatcher.pause();
            this.voiceConnection.setSpeaking(0);
            this.paused = true;
            this.UpdatePlaybackMessage();
        }
    }

    /**
     * Skips the currently playing song in the queue. If paused, begins playback.
     * (If song is provided then the song is only skipped if playing)
     * @param {Song | number} [song] - The song to begin playing
     */
    Skip(song) {
        if (song == undefined) {
            song = this.currentSong;
        } else {
            if (typeof song == "number") {
                song = song;
            } else {
                song = song.id;
            }
        }

        if (song == this.currentSong) {
            events.emit('next');
            if (this.currentSong >= this.songs.length) {
                // End of Queue.
                if (this.loop) {
                    // Loop around to the beginning
                    this.Play(this.songs[0]);
                    events.emit('loop');
                } else {
                    events.emit('finish');
                    this.paused = true;
                    this.currentSong = 0;
                    this.voiceConnection.setSpeaking(0);
                }
            } else {
                // Just go to the next song bro
                this.Play(this.songs[this.currentSong+1]);
            }
        }
    }

    /**
     * @typedef {object} AddOptions
     * @property {number} [index] - Add the song to this position in the queue (default behavior is to place it at the end)
     * @property {boolean} [nextInQueue = false] - Add the song to the queue but place it so it plays next
     */

    /**
     * Adds a song to the queue
     * @param {Song} song - The song to be added to the queue
     * @param {AddOptions} options - Additional options for adding the song
     * @throws {NoSuchSong}
     */
    Add(song, options) {
        if (options == undefined)
            options = {}
        
        if (song != undefined) {
            if (typeof song.GetStreamData == "function") {
                // Legit song, LETSS GO
                if (options != undefined) {
                    if (options.nextInQueue) {
                        song.temporary = true;
                    }
                }

                this.songs.push(song);

                if (options != undefined) {
                    if (options.nextInQueue) {
                        this.Move(song, this.songs[this.currentSong]); // Places the song behind current
                    } else if (!isNaN(options.index)) {
                        // is a number,
                        if (options.index <= this.songs.length) {
                            if (options.index<0)
                                options.index = 0;
                            this.Move(song, this.songs[options.index], 1); // Move BEFORE the song at the index
                        }
                    }
                }
            } else {
                throw new NoSuchSong(0);
            }

        }

    }

    /**
     * Toggle repeat mode for the queue/song. No repeat -> queue repeat -> song repeat
     * 
     * @param {boolean} [enable] - If defined the repeat status will be set to this value.
     * @param {boolean} [track = false] - Whether or not to set status to the track or queue. (Default queue)
     * @return {number} Returns status. 0: Disabled, 1: Queue, 2: Track
     */
    Repeat(enable, track) {
        if (enable == undefined && track == undefined) {
            // toggle mode?
            if (this.repeat) {
                this.repeat = false;
                this.songs[this.currentSong].loop = true;
                return 2;
            } else {
                if (this.songs[this.currentSong].loop) {
                    this.songs[this.currentSong].loop = false;
                    this.repeat = false;
                    return 0;
                } else {
                    this.repeat = true;
                    this.songs[this.currentSong].loop = false;
                    return 1
                }
            }
        }

        if (track == true) {
            if (enable != undefined) {
                enable = (enable == true);
                if (enable)
                    this.repeat = false;

                this.songs[this.currentSong].loop = enable;
            } else {
                let status = !this.songs[this.currentSong].loop;
                this.songs[this.currentSong].loop = status;
                if (status)
                    this.repeat = false;
            }
        } else {
            if (enable != undefined) {
                enable = (enable == true);
                if (enable)
                    this.songs[this.currentSong].loop = false;

                this.repeat = enable;
            } else {
                let status = !this.repeat;
                this.repeat = status;
                if (status)
                    this.songs[this.currentSong].loop = false;
            }
        }

        return (this.repeat == true)? 1 : (this.songs[this.currentSong].loop == true)? 2 : 0;
    }

    /**
     * Toggle shuffle mode.
     * 
     * @param {boolean} [enable] - Whether or not to force shuffle on or off. If unspecified we toggle.
     */
    Shuffle(enable) {

    }

    /**
     * Removes a song from the queue
     * @param {Song | number} song - The song to remove from the queue
     */
    Remove(song) {

    }

    /**
     * Move a song to a another song's location
     * @param {Song} song - The song we move
     * @param {Song} toSong - to (depending on moveOptions, we can either go after, before or switch with this song)
     * @param {number} [moveOptions = 0] - How we move the song (default: after.) (0 = song goes after toSong, 1 = before toSong, 2 = switch the two positions)
     */
    Move(song, toSong, moveOptions) {

    }

    /**
     * Stops the queue. Pauses all playback and executes Destroy()
     * 
     */
    Stop() {
        this.Pause();
        this.Destroy();
    }

    /**
     * Disconnects the bot from the voice chat, cleans up the playback message, and destroys the queue.
     * @param {boolean} force - Force voice connection disconnect (will disconnect the bot from its current VC!)
     */
    Destroy(force) {

    }

    /**
     * Updates the playback message to show the current playback status.
     * 
     */
    UpdatePlaybackMessage() {
        if (this.paused) {
            this.playbackMessage.edit("[PAUSED] " + this.songs[this.currentSong].title);
        } else {
            this.playbackMessage.edit("Playing " + this.songs[this.currentSong].title);
        }

    }



    /**
     * @typedef {object} saveOptions
     * @property {number} [saveLocation = 2] - Where the queue is being saved. 0 = guild, 1 = guildPersonal (only that user can view it), 2 = personal (personal storage)
     * @property {string} [guildID] - The guild we're saving this to
     * @property {boolean} [guild = false] - Whether or not we're saving to a guild or a user's profile (private call)
     * 
     */
    /**
     * Saves the queue to disk. Wrapper for Queuer.SaveQueue(this, ...)
     * 
     * @param {string} name - Name for the queue
     * @param {string} authorID - The Discord user ID of the user trying to save this queue
     * @param {saveOptions} saveOptions - Additional options for saving this queue
     */
    Save(name, authorID, saveOptions) {

    }

}

class NoVoiceConnection extends Error {
    constructor(action = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoQueueError);
        }

        this.name = "NoVoiceConnection";
        this.action = action;
    }
}
class NoVoiceChannel extends Error {
    constructor(action = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoQueueError);
        }

        this.name = "NoVoiceChannel";
        this.action = action;
    }
}
class NoVoiceChannelPermissions extends Error {
    constructor(permission = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoQueueError);
        }

        this.name = "NoVoiceChannelPermissions";
        this.permission = permission;
    }
}
class NoSuchSong extends Error {
    constructor(id = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoQueueError);
        }

        this.name = "NoSuchSong";
        this.id = id;
    }
}

module.exports = Queue;