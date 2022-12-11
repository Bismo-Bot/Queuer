// Queue 'class'

const Discord = require("discord.js");
const Song = require('./song');//(Bismo);
const EventEmitter = require('events');
const DiscordVoice = require("@discordjs/voice");

const crypto = require("node:crypto")

const BismoAudioPlayer = require('./../../Support/VoiceManager.js').BismoAudioPlayer;
const BismoVoiceChannel = require('./../../Support/VoiceManager.js').BismoVoiceChannel;


class Queue {

    /**
     * The queue ID (typically just a number that increments up with every new queue)
     * @type {number}
     */
    id;

    /**
     * The guild we're playing in (or if personal, authorID)
     * @type {string}
     */
    guildId;

    /**
     * The author (creator) of this queue
     * @type {string}
     */
    authorID;

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
     * @typedef {DiscordVoice.AudioPlayer} AudioPlayer
     */
    /**
     * @typedef {DiscordVoice.AudioResource} AudioResource
     */

    /**
     * VoiceConnection object for the voice channel
     * @type {VoiceConnection}
     */
    voiceConnection;

    /**
     * VoiceConnection's audioPlayer
     * @type {AudioPlayer}
     */
    audioPlayer;


    /**
     * Bismo voice channel
     * @type {import('./../../Support/VoiceManager.js').BismoVoiceChannel}
     */
    BismoVoiceChannel;

    /**
     * Bismo audio player
     * @type {import('./../../Support/VoiceManager.js').BismoAudioPlayer}
     */
    BismoAudioPlayer;


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
    songs = [];

    /**
     * Playback volume
     * @type {number}
     */
    volume = 50;

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


    /**
     * Additional constructor data
     * @typedef {object} ConstructorData
     * @property {[number|string]} queueID ID to set the queue to
     * @property {TextChannel} textChannel Text channel to link the queue to
     * @property {[string]} authorID UserID of the creator of this queue
     */

    /**
     * Creates a new queue
     * @param {string} guildID Guild that is hosting this queue
     * @param {VoiceChannel} voiceChannel Voice channel this queue is starting in
     * @param {ConstructorData} data Additional data to build the queue with
     */
    constructor(guildId, voiceChannel, data) {
        this.guildId = guildId;
        this.voiceChannel = voiceChannel;

        if (data != undefined) {
            if (data.textChannel != undefined)
                if (data.textChannel.type == "GUILD_TEXT")
                    this.textChannel = this.textChannel;

            if (data.queueID != undefined)
                if (typeof data.queueID !== "number" && typeof data.queueID !== "string")
                    throw new TypeError("data.queueID expected number|string got " + (typeof data.queueID).toString());
                else
                    this.id = data.queueID;
            else
                this.id = crypto.createHash("sha1").update(voiceChannel.guildId + voiceChannel.id + (Math.random().toString(36).substring(2)));

            if (data.authorID != undefined)
                if (typeof data.authorID === "number")
                    this.authorID = data.authorID
        }

        this.BismoVoiceChannel = process.Bismo.VoiceManager.GetBismoVoiceChannel(voiceChannel.id, guildId);
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
    JoinVoiceChannel = function() {
        this.BismoVoiceChannel.Connect();

        this.BismoAudioPlayer = process.Bismo.VoiceManager.CreateBismoAudioPlayer({
            pluginName: "Queuer",
            pluginPackage: "com.watsuprico.queuer",
            name: "Unknown",
        });
        this.BismoAudioPlayer.AudioPlayer = new DiscordVoice.createAudioPlayer({
            behaviors: {
                noSubscriber: DiscordVoice.NoSubscriberBehavior.Pause, // When no one is listening, we'll pause.
            }
        });
        this.BismoAudioPlayer.AudioPlayer.on(DiscordVoice.AudioPlayerStatus.Idle, async () => {
            let song = this.GetSong(this.currentSong);
            this.BismoVoiceChannel.GetVoiceConnection().setSpeaking(0);
            this.events.emit('finish', song);
            delete song.audioResource;
            await new Promise(r => setTimeout(r, 500)); // Wait a second or two before starting next song
            process.Bismo.log("finish: " + song.id)
            this.Next();
        });
        this.BismoAudioPlayer.AudioPlayer.on('error', error => {
            console.error(error);
            console.error(`[Queuer] Error playing ${error.resource.metadata.title}: ${error.message}`);
            //player.stop();
            this.Next(); // play next song
        });

        this.BismoVoiceChannel.Subscribe(this.BismoAudioPlayer);

        if (this.playbackMessageID == undefined) {
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
        if (this.BismoVoiceChannel == undefined) {
            this.BismoVoiceChannel = process.Bismo.VoiceManager.GetBismoVoiceChannel(this.voiceChannel.id, this.voiceChannel.guildId);
        }

        // First check if we are in a VC and have a voiceConnection
        if (this.BismoVoiceChannel.GetVoiceConnection() == undefined) {
            // try and connect to the vc?
            if (this.JoinVoiceChannel() != true) {
                throw new NoVoiceConnection("Play", "No voiceChannel available.");
            }
        } else if (this.BismoVoiceChannel.GetVoiceConnection().status == DiscordVoice.VoiceConnectionStatus.Disconnected || this.BismoVoiceChannel.GetVoiceConnection().status == DiscordVoice.VoiceConnectionStatus.Destroyed) {
            // Disconnected, reconnect
            // This solves the stopped issue
            if (this.JoinVoiceChannel() != true) {
                throw new NoVoiceConnection("Play", "No voiceChannel available.");
            }
        }

        // At some point add Bismo.Audio.RequestFocus() or Bismo.Audio.GetFocus()
        if (this.BismoAudioPlayer?.AudioPlayer == undefined) {
            // The audioPlayer somehow just kinda died, recreate it
            if (this.JoinVoiceChannel() != true) {
                throw new NoVoiceConnection("Play", "No audioPlayer available.");
            }
        }

        if (this.paused && this.currentSong != undefined) {
            this.BismoAudioPlayer.AudioPlayer.play();
            this.BismoVoiceChannel.GetVoiceConnection().setSpeaking(1);
            this.paused = false;
            this.UpdatePlaybackMessage();
            this.events.emit("play", this.currentSong);
            return true;
        }

        // Okay we're in a VC, play
        if (song == undefined) {
            // Just a simple PLAY, so find the current song
            song = this.GetSong(this.currentSong);
        }

        if (song == undefined) 
            throw new NoSuchSong(this.currentSong);

        let stream = song.GetStreamData();
        if (stream == undefined)
            throw new NoSuchSong(this.currentSong, "Invalid stream data.");

        this.currentSong = song.id; // Update queue play head

        if (song.audioResource == undefined) {
            song.audioResource = DiscordVoice.createAudioResource(stream, {
                inputType: DiscordVoice.StreamType.WebmOpus,
                inlineVolume: true,
                metadata: {
                    title: song.title,
                    queueID: this.id,
                    songID: song.id,
                },
            });
            //song.audioResource.on('error', error => {
            //    // Do something. Maybe goto the next song?
            //});
        }
            
        this.BismoAudioPlayer.AudioPlayer.play(song.audioResource);

        song.audioResource.volume.setVolume(this.volume/100);

        console.log("Playing queue " + this.id + ". Song ID " + this.currentSong + " (" + song.title + ")");
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
            this.BismoAudioPlayer.AudioPlayer.pause();
            this.BismoVoiceChannel.GetVoiceConnection().setSpeaking(0);
            this.paused = true;
            this.UpdatePlaybackMessage();
            this.events.emit("pause", song);
        }
    }

    /**
     * Skips the currently playing song in the queue. If paused, begins playback.
     * (If song is provided then the song is only skipped if playing)
     * @param {Song | number} [song] - We play whatever song comes after this one.
     * @param {NextTrackReason} [reason] Reason for calling Next() _(this is largely so we can distinguish from user calls and end of song calls)_
     */
    Next(song, reason) {
        if (song == undefined) {
            song = this.currentSong;
        } else {
            if (typeof song == "number") {
                song = song;
            } else {
                song = song.id;
            }
        }

        this.events.emit('next');
        if (this.currentSong >= this.songs.length-1) {
            if (reason == NextTrackReason.EndOfSong) {
                // End of Queue.
                if (this.loop) {
                    // Loop around to the beginning
                    this.Play(this.songs[0]);
                    this.events.emit('loop', this);
                } else {
                    this.events.emit('finish-queue', this);
                    this.paused = true;
                    this.currentSong = 0;
                    this.BismoVoiceChannel.GetVoiceConnection().setSpeaking(0);
                    process.Bismo.log("Finished queue " + this.id);
                }
            }
            
        } else {
            // Just go to the next song bro
            this.Play(this.songs[this.currentSong+1]);
        }
    }

    Previous(song) {
        
    }

    /**
     * @typedef {object} AddOptions
     * @property {number} [index] - Add the song to this position in the queue (default behavior is to place it at the end)
     * @property {boolean} [nextInQueue = false] - Add the song to the queue but place it so it plays next
     */

    /**
     * Adds a song to the queue
     * @param {Song} song - The song to be added to the queue
     * @param {[AddOptions]} options - Additional options for adding the song
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

                song.id = this.songs.length;
                song.queue = this;
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

        if (this.songs.length == 1) {
            this.currentSong = 0;
            this.Play();
        } else if (this.paused || this.BismoAudioPlayer.AudioPlayer.state.status == "idle") {
            this.Play();
        }
        return true;
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
     * 
     * @param {number} toTime - Seek {@link song} to this time (_in ms_) or seek the current song to this time in ms. 
     * @param {Song} [song] - The song 
     */
    SeekSong(toTime, song) {
        if (typeof toTime !== "number")
            throw new TypeError("toTime expected number got " + (typeof toTime).toString());

        if (song == undefined) {
            song = this.currentSong;
        } else {
            if (typeof song == "number") {
                song = song;
            } else {
                song = song.id;
            }
        }

    }

    /**
     * Stops the queue. Pauses all playback and executes leaves the voice chat. Queue still available.
     * 
     */
    Stop() {
        this.Pause();
        this.BismoVoiceChannel.GetVoiceConnection().disconnect();
    }

    /**
     * Disconnects the bot from the voice chat, cleans up the playback message, and destroys the queue.
     */
    Destroy() {
        if (this.playbackMessage != undefined)
            this.playbackMessage.delete();
        
        this.VoiceChannel.Destroy();
        this.paused = true;
        this.UpdatePlaybackMessage();
        delete this.songs;
        this.events.emit("destroyed", this.id);
        delete this.voiceChannel;
    }

    /**
     * Updates the playback message to show the current playback status.
     * 
     */
    UpdatePlaybackMessage() {
        if (this.playbackMessage != undefined) {
            if (this.paused) {
                this.playbackMessage.edit("[PAUSED] " + this.songs[this.currentSong].title);
            } else {
                this.playbackMessage.edit("Playing " + this.songs[this.currentSong].title);
            }
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

const NextTrackReason = {
    UserRequest: "UserRequest",
    EndOfSong: "EndOfSong"
}

class NoVoiceConnection extends Error {
    constructor(action = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoVoiceConnection);
        }

        this.name = "NoVoiceConnection";
        this.action = action;
    }
}
class NoVoiceChannel extends Error {
    constructor(action = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoVoiceChannel);
        }

        this.name = "NoVoiceChannel";
        this.action = action;
    }
}
class NoVoiceChannelPermissions extends Error {
    constructor(permission = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoVoiceChannelPermissions);
        }

        this.name = "NoVoiceChannelPermissions";
        this.permission = permission;
    }
}
class NoSuchSong extends Error {
    constructor(id = "unknown", ...params) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoSuchSong);
        }

        this.name = "NoSuchSong";
        this.id = id;
    }
}

module.exports = Queue;
// module.exports = function(bismo) {
//     Bismo = bismo;
//     return Queue;
// }