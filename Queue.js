// Queue 'class'

const Discord = require("discord.js");
const Song = require('./song');//(Bismo);
const EventEmitter = require('events');
const DiscordVoice = require("@discordjs/voice");

const crypto = require("node:crypto")


const NextTrackReason = Object.freeze({
    ErrorPlayingPreviousSong: "ErrorPlayingPreviousSong",
    UserRequest: "UserRequest",
    EndOfSong: "EndOfSong"
});
const PauseReason = Object.freeze({
    NotPaused: "NotPaused",
    LostBismoVoiceChannelFocus: "LostFocus",
    UserRequest: "UserRequest",
    Stopped: "Stopped",
});
const RepeatStatus = Object.freeze({
    None: 0,
    Queue: 1,
    Song: 2
});


/**
 * Checks if a variable is an array of a certain type
 * @param {*} data - The variable to check
 * @param {*} type - The type to check against
 * @return {boolean} True if the variable is an array of the specified type, false otherwise
 */
function isArrayOfType(data, type) {
    return Array.isArray(data) && data.every(elem => {
        if (typeof type === "object")
            return elem instanceof type
        else
            return typeof elem === type
    });
}


class Queue extends EventEmitter {

    /**
     * The queue ID (UUID)
     * @type {string}
     */
    Id = crypto.randomUUID();

    /**
     * The guild we're playing in (or if personal, authorID)
     * @type {string}
     */
    get GuildId() {
        return this.VoiceChannel.guildId;
    };

    /**
     * The author (creator) of this queue
     * @type {string}
     */
    AuthorID;


    // Audio things
    /**
     * Bismo voice channel
     * @type {import('./../../Support/VoiceManager.js').BismoVoiceChannel}
     */
    #BismoVoiceChannel;
    get BismoVoiceChannel() {
        return this.#BismoVoiceChannel;
    }

    /**
     * Returns the VoiceChannel of the BismoVoiceChannel
     * @type {Discord.VoiceChannel}
     */
    get VoiceChannel() {
        return this.#BismoVoiceChannel.ChannelObject;
    }

    /**
     * Returns the VoiceConnection of the BismoVoiceChannel
     * @type {DiscordVoice.VoiceConnection}
     */
    get VoiceConnection() {
        return this.#BismoVoiceChannel.GetVoiceConnection();
    }

    /**
     * Bismo audio player
     * @type {import('./../../Support/VoiceManager.js').BismoAudioPlayer}
     */
    #BismoAudioPlayer;
    get BismoAudioPlayer() {
        return this.#BismoAudioPlayer;
    }

    /**
     * The playback message object, exists inside the VoiceChannel text chat (fancy!)
     * @type {Discord.Message}
     */
    #PlaybackMessage;
    get PlaybackMessage() {
        return this.#PlaybackMessage;
    }

    /**
     * If true we edit the #PlaybackMessage on queue status change. If false, or the PlaybackMessage is not editable, we delete the previous playback message and send a new one on queue status change.
     * @type {boolean}
     */
    ReusePlaybackMessage = true;


    // Queue items
    /**
     * The playback order of the songs in the queue. SongsOrder[i] -> Songs[SongsOrder[i]]
     * @type {number[]}
     */
    #SongsOrder = [];

    /**
     * Array of song objects. LIFO. Do not change the order of songs, use the #SongsOrder array to modify the order of the queue.
     * @type {Song[]}
     */
    #Songs = [];
    // Gets the current songs as they're ordered
    get Songs() {
        let songs = [];
        for (var i = 0; this.#SongsOrder.length; i++) {
            if (this.#SongsOrder[i] < this.#Songs.length && this.#SongsOrder[i] >= 0)
                songs.push(this.#Songs[this.#SongsOrder[i]]);
        }
        return [...songs];
    }
    set Songs(songs) {
        // Remove songs that are not there...
        // for now just remove all, then re-add
        this.Stop();

        this.#Songs = [];
        this.#SongsOrder = [];
        let songNumber = 0;
        for (var i = 0; i<songs.length; i++) {
            if (songs[i] instanceof Song) {
                this.#Songs.push(Song);
                this.#SongsOrder[songNumber] = songNumber;
                songNumber++;
            }
        }
        this.#HeadIndex = 0;
    }

    /**
     * Current song index we're playing/on (#Songs[#SongsOrder[#HeadIndex]])
     * @type {number}
     */
    #HeadIndex = 0;
    get HeadIndex() {
        return this.#HeadIndex;
    }


    /**
     * Whether or not the queue is currently paused
     * @type {boolean}
     */
    #Paused;
    get Paused() {
        return this.#Paused;
    }
    set Paused(value) {
        if (value === true)
            this.Pause();
        if (value === false)
            this.Play();
    }

    /**
     * Reason for being paused
     * @type {PauseReason}
     */
    #PausedReason;
    get PausedReason() {
        return this.#PausedReason;
    }

    /**
     * The currently playing song ID
     * @type {Song}
     */
    #CurrentSong;
    get CurrentSong() {
        return this.#CurrentSong;
    }
    set CurrentSong(song) {
        this.Play(song);
    }

    /**
     * Shuffle status
     * @type {boolean}
     */
    #Shuffle = false;
    get Shuffle() {
        return this.#Shuffle;
    }
    set Shuffle(value) {
        this.#SetShuffle(value);
    }

    /**
     * Queue loop status.
     * 0 = off, 1 = repeat (queue), 2 = loop (song)
     * @type {RepeatStatus}
     */
    #Repeat;
    get Repeat() {
        return this.#Repeat;
    }
    set Repeat(value) {
        this.#SetRepeat(value);
    }


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
     */

    /** @type {import('./LogMan.js').Logger} */
    #log;


    /**
     * Additional constructor data
     * @typedef {object} ConstructorData
     * @property {[string]} authorId - UserId of the creator of this queue
     * @property {[number|string]} [queueId] - Id to set the queue to. If empty we generate a new UUID
     */

    /**
     * Creates a new queue
     * @param {Discord.VoiceChannel} voiceChannel - Voice channel this queue is living in. MUST be provided, must be a valid VoiceChannel. Queue will be placed in the guild this VC is in.
     * @param {ConstructorData} data Additional data to build the queue with
     */
    constructor(voiceChannel, data) {
        super();

        this.#BismoVoiceChannel = process.Bismo.VoiceManager.GetBismoVoiceChannel(voiceChannel)

        if (data != undefined) {
            if (data.queueId != undefined) {
                if (typeof data.queueId !== "number" && typeof data.queueId !== "string") {
                    throw new TypeError("data.queueID expected number|string got " + (typeof data.queueId).toString());
                } else {
                    this.#Id = data.queueId;
                }
            } else {
                this.#Id = crypto.randomUUID();
            }

            if (data.authorId != undefined) {
                if (typeof data.authorId === "number") {
                    this.AuthorId = data.authorId
                }
            }
        }

        this.#log = process.Bismo.LogMan.getLogger("Queue-" + this.#Id);
    }


    /**
     * Creates the playback message
     */
    async #CreatePlaybackMessage() {
        if (this.#PlaybackMessage == undefined || !(this.#PlaybackMessage instanceof Discord.Message)) {
            this.#BismoVoiceChannel.ChannelObject.send("Queuer playback status message. You can view information about which is playing via this message. I'll pin it in this channel.").then(async (msg) => {
                this.#PlaybackMessage = msg;
                if (msg.pinable) {
                    msg.pin("Pinning queue playback status message").then((pinMsg) => {
                        pinMsg.delete();
                    });
                }
                if (!msg.editable) {
                    msg.delete();
                    this.#PlaybackMessage = await this.#BismoVoiceChannel.ChannelObject.send("My messages are not editable here. Playback message quality will be degraded!");
                }
            });
        }
    }


    /**
     * Returns the queue position this song is in. That is, the index of this song inside #SongsOrder
     * @param {Song} song - Song to find
     * @return {number}
     */
    #GetSongQueueNumber(song) {
        if (song == undefined)
            return undefined;

        if (!(song instanceof Song))
            throw new TypeError("song expected Song got " + (typeof song).toString());

        for (var i = 0; i<this.#SongsOrder; i++) {
            let index = this.#SongsOrder[i];
            if (index < this.#Songs.length && index >= 0)
                if (this.#Songs[index].Id == song.Id)
                    return index;
        }
    }

    /**
     * Updates the playback message to show the current playback status.
     * 
     */
    #UpdatePlaybackMessage() {
        if (this.playbackMessage != undefined) {
            if (this.playbackMessage.editable)
                if (this.paused) {
                    this.playbackMessage.edit("[PAUSED] " + this.songs[this.currentSong].title);
                } else {
                    this.playbackMessage.edit("Playing " + this.songs[this.currentSong].title);
                }
        }
    }





    /**
     * Gets a Song object from its ID
     * @param {(Song|number|string)} id - Either the queue spot number (i.e. song x) or a song's id (string)
     * @param {number} offset - Offset the found index by this value. So, if you want to find the next song in queue, set this value to '1' and id to the current song.
     * @return {Song} The song object.
     */
    GetSong(id, offset) {
        if (this.songs == undefined)
            return undefined;
        if (offset == undefined)
            offset = 0;

        if (id instanceof Song) {
            return this.GetSong(this.#GetSongQueueNumber(id));
        }

        if (typeof id === "string") {
            for (var index = 0; i<this.songs.length; i++) {
                if (this.#Songs[this.#SongsOrder[index]].Id == id) {
                    index += offset;
                    if (this.#SongsOrder.length >= index || index < 0)
                        return undefined;
                    else
                        return this.#Sogns[this.#SongsOrder[index]];
                }
            }
        } else if (typeof id === "number") {
            let index = id + offset;
            if (this.#SongsOrder.length >= index || index < 0)
                return undefined;
            else
                return this.#Sogns[this.#SongsOrder[index]];
        }
        return undefined;
    }


    /**
     * Joins the VoiceChannel, creates a BAP (if none exists) and creates the BAP's AudioPlayer
     * @return {boolean} Whether or not the voiceConnection was created
     */
    #JoinVoiceChannel() {
        let voiceConnection = this.#BismoVoiceChannel.Connect();
        if (voiceConnection.state == DiscordVoice.VoiceConnectionStatus.Destroyed || voiceConnection.state == DiscordVoice.VoiceConnectionStatus.Disconnected)
            return false;

        if (this.#BismoAudioPlayer === undefined) {
            this.BismoAudioPlayer = process.Bismo.VoiceManager.CreateBismoAudioPlayer({
                pluginName: "Queuer",
                pluginPackage: "com.watsuprico.queuer",
                name: "Queuer",
            });

            // Pause on focus loss (which should happen since the AudioPlayer has no listeners...)
            this.#BismoAudioPlayer.on('unfocused', (data) => {
                if (data.Id == this.#BismoVoiceChannel.Id) {
                    this.#Paused = true;
                    this.#PausedReason = PauseReason.LostBismoVoiceChannelFocus;
                    this.#BismoAudioPlayer.AudioPlayer.pause();
                    this.#UpdatePlaybackMessage();
                }
            });

            // Play on focus regain
            this.#BismoAudioPlayer.on('unfocused', (focused) => {
                if (data.Id == this.#BismoVoiceChannel.Id) {
                    if (this.#Paused && this.#PausedReason == PauseReason.LostBismoVoiceChannelFocus) {
                        this.#BismoAudioPlayer.AudioPlayer.unpause();
                        this.#Paused = false;
                        this.#PausedReason = PauseReason.NotPaused;
                        this.#UpdatePlaybackMessage();
                    }
                }
            });
        } else {
            this.#BismoAudioPlayer.AudioPlayer.stop(); // We're creating a new AudioPlayer ..
        }

        this.#BismoAudioPlayer.AudioPlayer = new DiscordVoice.createAudioPlayer({
            behaviors: {
                noSubscriber: DiscordVoice.NoSubscriberBehavior.Pause, // When no one is listening, we'll pause.
            }
        });

        // Once the song finishes (AudioPlayer becomes idle)
        this.#BismoAudioPlayer.AudioPlayer.on(DiscordVoice.AudioPlayerStatus.Idle, () => {
            // Whenever we're doing playing.
            let song = this.#CurrentSong;
            delete song.audioResource; // Clean up the resource

            this.BismoVoiceChannel.GetVoiceConnection().setSpeaking(0); // No longer speaking
            this.emit('finish', { song: song });
            this.#log.info("Finished: " + song.id);

            if (this.#Repeat == RepeatStatus.Song) {
                // Replay song...
                this.emit("repeat", { song: this.#CurrentSong });
                this.Play(this.#CurrentSong);
            } else
                setTimeout(this.Next(), 500);
        });

        this.#BismoAudioPlayer.AudioPlayer.on(DiscordVoice.AudioPlayerStatus.AutoPaused, () => {
            this.#Paused = true;
            this.#PausedReason = PauseReason.LostBismoVoiceChannelFocus;
            this.#UpdatePlaybackMessage();
        });
        this.#BismoAudioPlayer.AudioPlayer.on(DiscordVoice.AudioPlayerStatus.Playing, () => {
            this.#Paused = false;
            this.#PausedReason = PauseReason.NotPaused;
            this.#UpdatePlaybackMessage();
        });

        this.#BismoAudioPlayer.AudioPlayer.on('error', error => {
            this.#log.error(`Error playing ${error.resource.metadata.title}: ${error.message}`);
            this.#log.silly(error);
            
            this.#UpdatePlaybackMessage(`Error playing ${error.resource.metadata.title}: ${error.message}\nNext song will play in 2 seconds.`);

            if (this.#Songs.length == 1)
                this.#Repeat = RepeatStatus.None; // Disable loop, song broken.
            else
                this.#Repeat = RepeatStatus.Queue; // Stop repeating song.
            
            setTimeout(this.Next(), 2000);
        });

        this.#BismoVoiceChannel.Subscribe(this.#BismoAudioPlayer);

        this.#CreatePlaybackMessage();
        return true;
    }



    /**
     * 
     * Playback controls
     * 
     */

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
        if (this.VoiceConnection == undefined) {
            // try and connect to the vc?
            if (this.#JoinVoiceChannel() != true) {
                throw new NoVoiceConnection("Play", "No VoiceChannel available.");
            }
        } else if (this.VoiceConnection.status == DiscordVoice.VoiceConnectionStatus.Disconnected || this.VoiceConnection.status == DiscordVoice.VoiceConnectionStatus.Destroyed) {
            // Disconnected, reconnect
            // This solves the stopped issue
            if (this.#JoinVoiceChannel() != true) {
                throw new NoVoiceConnection("Play", "No VoiceChannel available.");
            }
        }

        if (this.#BismoAudioPlayer == undefined) {
            if (!this.#JoinVoiceChannel())
                throw new NoVoiceConnection("Play", "No BismoAudioPlayer");

            if (this.#BismoAudioPlayer?.AudioPlayer == undefined) {
                // The audioPlayer somehow just kinda died, recreate it
                if (this.#JoinVoiceChannel() != true) {
                    throw new NoVoiceConnection("Play", "No AudioPlayer available.");
                }
            }
        }

        if (song == undefined && this.#CurrentSong != undefined) {
            this.#BismoAudioPlayer.AudioPlayer.unpause();
            this.#Paused = false;
            this.#PausedReason = PauseReason.NotPaused;

            this.VoiceConnection.setSpeaking(1);

            this.UpdatePlaybackMessage();
            this.#log.debug("Begun playing song: " + this.#CurrentSong.Title);
            this.#log.silly(this.#CurrentSong.ToString());
            this.events.emit("play", { song: this.#CurrentSong });
            return true;
        }


        if (song == undefined)
            throw new TypeError("song expected Song got undefined");

        let stream = song.GetStreamData();
        if (stream == undefined)
            throw new NoSuchSong(song.Id, "Invalid stream data.");

        let songQueueNumber = this.#GetSongQueueNumber(song);
        if (songQueueNumber === undefined) {
            this.Add(song);
            songQueueNumber = this.#SongsOrder.length-1;
        }
        this.#CurrentSong = song;
        this.#HeadIndex = songQueueNumber;


        if (song.AudioResource == undefined) {
            song.AudioResource = DiscordVoice.createAudioResource(stream, {
                inputType: DiscordVoice.StreamType.WebmOpus,
                metadata: {
                    title: song.title,
                    queueID: this.#Id,
                    songID: song.id,
                },
            });
        }
            
        this.#BismoAudioPlayer.AudioPlayer.play(song.AudioResource);

        //song.AudioResource.volume.setVolume(this.volume/100);

        this.#log.debug("Now playing song: " + this.#CurrentSong.Title + ".");
        this.#log.silly(this.#CurrentSong.ToString());
        this.UpdatePlaybackMessage();
    }

    /**
     * Pauses the queue
     * (If song is provided then the queue is only paused if that song is playing)
     * @param {Song | number} [song] - Pause only if playing this song
     */
    Pause(song) {
        if (song == undefined) {
            this.#BismoAudioPlayer.AudioPlayer.pause();
            this.#Paused = true;
            this.#PausedReason = PauseReason.UserRequest;

            this.VoiceConnection().setSpeaking(0);
            
            this.#UpdatePlaybackMessage();
            this.emit("pause", { song: song });
            this.#log.debug("Paused");

            return true;
        }


        let index = -1;
        if (song instanceof Song) {
            index = this.#GetSongQueue(song);
        } else if (typeof song === "number") {
            if (song >= this.#SongsOrder.length || song < 0)
                Error("Provided song index is out of bounds. Our queue is not that big.");
            else
                index = song;
        } else {
            // this.Pause();
            throw new TypeError("song expected Song or number got " + toString(typeof song));
        }
        
        if (index == -1) {
            // this.Pause();
            throw new Error("Song location could not be found. Is that sound in our queue?");
        }

        if (index == this.#GetSongQueueNumber(this.#CurrentSong)) {
            this.Pause();
        }
    }

    /**
     * Skips the currently playing song in the queue. If paused, begins playback.
     * (If song is provided then the song is only skipped if playing)
     * @param {(Song|string|number)} [song] - We play whatever song comes after this one.
     */
    Next(song) {
        if (song === undefined)
            song = this.#CurrentSong;

        if ((song instanceof Song))
           if (this.#GetSongQueueNumber(song) == undefined)
                return false; // Song is not even in the damn queue.

        let nextSong = this.GetSong(song, 1);
        let nextSongIndex = this.#GetSongQueueNumber(song);

        
        if (this.#Repeat == RepeatStatus.Song)
            this.#Repeat == RepeatStatus.Queue; // Switch to loop (next pressed by user)

        if (this.#CurrentSong.Temporary) {
            this.#log.debug("Removing temporary song: " + this.#CurrentSong.Title);
            this.Remove(this.#CurrentSong); // Remove it
        }

        if (nextSong == undefined) {
            // end of queue OR there's no song after that one...
            if (this.#Repeat == RepeatStatus.Queue) {
                // Go to beginning
                this.emit('loop');

                this.#HeadIndex = 0;
                if (this.#Songs.length > 0)
                    this.Play(this.#Songs[this.#SongsOrder[0]]);
                
                this.#log.debug("Queue looped");
                return true;
            } else {
                this.emit('finish');
                this.BismoVoiceChannel.GetVoiceConnection().setSpeaking(0);

                this.#Paused = true;
                this.#PausedReason = PauseReason.Stopped;

                this.#HeadIndex = 0;
                if (this.#Songs.length > 0)
                    this.#CurrentSong = this.#Songs[this.#SongsOrder[0]]

                this.#log.debug("Queue finished.");
                return false;
            }
        } else {
            // Just go to the next song bro
            this.emit('next', { previousSong: this.#CurrentSong, nextSong: nextSong });
            this.#HeadIndex = nextSongIndex;
            this.Play(nextSong);
            return true;
        }
    }

    /**
     * Goes to the previous song. If paused, begins playback. If we're at the top of the queue, we just restart this song.
     * (If song is provided then the song is only skipped if playing)
     * @param {(Song|number)} [song] - We play whatever song comes before this one.
     */
    Previous(song) {
        if (song === undefined)
            song = this.#CurrentSong;

        if ((song instanceof Song))
           if (this.#GetSongQueueNumber(song) == undefined)
                return false; // Song is not even in the damn queue.

        let prevSong = this.GetSong(song, -1);
        let prevSongIndex = this.#GetSongQueueNumber(song);

        if (this.#Repeat == RepeatStatus.Song)
            this.#Repeat == RepeatStatus.Queue; // Switch to loop (next pressed by user)

        if (prevSong == undefined) {
            prevSong = this.#Songs[this.#SongsOrder[0]]; // ehh we're at the top, right?
        } else {
            if (this.#CurrentSong.Temporary) {
                this.#log.debug("Removing temporary song: " + this.#CurrentSong.Title);
                this.Remove(this.#CurrentSong); // Remove it
            }
        }

        this.emit('previous', { currentSong: this.#CurrentSong, previousSong: nextSong });
        this.#HeadIndex = prevSongIndex;
        this.Play(prevSong);
        return true;
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
                let queueIndex = -1;
                if (options != undefined) {
                    if (options.nextInQueue === "true") {
                        queueIndex = this.#GetSongQueueNumber(this.#CurrentSong);
                    } else if (typeof options.index === "number") {
                        if (options.index < this.#SongsOrder.length && options.index >= 0)
                            queueIndex = options.index;
                    }
                }

                song.Queue = this;
                this.#Songs.push(song);
                this.#SongsOrder.splice(queueIndex, 0, this.#Songs.length-1);

                if (this.#Songs.length == 1) {
                    // First song, begin playing!
                    this.Play();
                }

                return true;
            } else {
                throw new NoSuchSong(0);
            }
        } else {
            throw new TypeError("song expected Song not undefined.");
        }
    }

    /**
     * Toggle repeat mode for the queue/song. No repeat -> queue repeat -> song repeat
     * 
     * @param {RepeatStatus} value - 0: disable repeat, 1: repeat (loop) queue, 2: repeat song
     * @return {number} Returns status. 0: Disabled, 1: Queue, 2: Track
     */
    #SetRepeat(toValue) {
        if (toValue == undefined) {
            if (this.#Repeat == 2)
                this.#Repeat = 0;
            else
                this.#Repeat++;
        } else if (typeof toValue === "number") {
            if (toValue >= 0 && toValue < 4) {
                this.#Repeat = toValue;
            }
            return this.#Repeat;
        } else {
            throw new TypeError("toValue expected number got " + toString(typeof toValue));
        }
    }

    /**
     * Toggle shuffle mode.
     * 
     * @param {boolean} [enable] - Whether or not to force shuffle on or off. If unspecified we toggle.
     */
    #SetShuffle(enable) {
        if (enable !== true && enable !== false)
            enable = !this.#Shuffle;

        if (this.#Shuffle && !enable) {
            // Disable shuffle
            this.#SongsOrder.sort((a,b) => a-b);
            this.#Shuffle = false;

        } else if (!this.#Shuffle && enable) {
            // Enable shuffle
            for (let i = this.#SongsOrder.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.#SongsOrder[i], this.#SongsOrder[j]] = [this.#SongsOrder[j], this.#SongsOrder[i]];
            }

            this.#Shuffle = true;
        }
        return this.#Shuffle;
    }

    /**
     * Removes a song from the queue
     * @param {(Song|number)} song - The song to remove from the queue
     */
    Remove(song) {
        if (song == undefined) {
            song = this.currentSong;
        }

        let index = this.#GetSongQueueNumber(song);
        if ((song instanceof Song)) {
            if (index == undefined) {
                return false;
            }
        } else if (typeof song === "number") {
            index = song;
        } else {
            throw new TypeError("song expected Song or number not " + toString(typeof song));
        }

        if (index >= 0 && index < this.#SongsOrder.length) {
            let songsIndex = this.#SongsOrder[index];
            this.#SongsOrder.splice(songsIndex, 1);
            if (this.#Songs[songsIndex].IsPlaying()) {
                this.#Songs.splice(songsIndex);
                this.Next();
            } else
                this.#Songs.splice(songsIndex);
        }

        if (index !== -1) {
            this.songs.splice(index, 1);
        }
    }

    /**
     * Move a song to a another song's location
     * @param {(Song|number)} song - The song we move
     * @param {(Song|number)} toSong - to (depending on moveOptions, we can either go after, before or switch with this song)
     * @param {number} [moveOptions = 0] - How we move the song (default: after.) (0 = song goes after toSong, 1 = before toSong, 2 = switch the two positions)
     */
    Move(song, toSong, moveOptions) {
        if (moveOptions === undefined)
            moveOptions = 0;
        else if (typeof moveOptions !== "number")
            moveOptions = 0;
        else if (moveOptions > 2 || moveOptions < 0)
            moveOptions = 0;

        if (song == undefined || toSong == undefined)
            return;

        if (typeof song !== "number" && !(song instanceof Song))
           throw new TypeError("song expected Song or number not " + toString(typeof song));
       if (typeof toSong !== "number" && !(toSong instanceof Song))
           throw new TypeError("song expected Song or number not " + toString(typeof song));

        let songIndex = this.#GetSongQueueNumber(song);
        if (songIndex == undefined)
            throw new NoSuchSong(song);
        let actualSongLocation = this.#SongsOrder[songIndex];

        let toSongIndex = this.#GetSongQueueNumber(toSong);
        if (toSongIndex == undefined)
            throw new NoSuchSong(toSong);
        let actualToSongLocation = this.#SongsOrder[toSongIndex];



        this.#SongsOrder.splice(songIndex, 1); // Remove from queue
        if (moveOptions == 0) {
            this.#SongsOrder.splice(toSongIndex+1, 0, actualSongLocation);
            if (this.#Songs[actualSongLocation].IsPlaying()) {
                this.#HeadIndex = toSongIndex+1;
            }
        } else if (moveOptions == 1) {
            this.#SongsOrder.splice(toSongIndex, 0, actualSongLocation);
            if (this.#Songs[actualSongLocation].IsPlaying()) {
                this.#HeadIndex = toSongIndex;
            }
        } else {
            this.#SongsOrder.splice(songIndex, 1); // Remove from queue
            this.#SongsOrder.splice(toSongIndex, 0, actualSongLocation);
            this.#SongsOrder.splice(songIndex, 0, actualToSongLocation);
            if (this.#Songs[actualSongLocation].IsPlaying()) {
                this.#HeadIndex = toSongIndex;
            }
        }
    }




    /**
     * Stops the queue. Pauses all playback and executes leaves the voice chat. Queue still available.
     * 
     */
    Stop() {
        this.Pause();
        this.#PausedReason = PauseReason.Stopped;
        this.#UpdatePlaybackMessage();
        this.#BismoAudioPlayer.Destroy();
    }




    /**
     * Disconnects the bot from the voice chat, cleans up the playback message, and destroys the queue.
     */
    Destroy() {
        if (this.#PlaybackMessage != undefined)
            this.#PlaybackMessage.delete();
        
        this.#BismoVoiceChannel.Destroy()
        this.paused = true;
        if (this.playbackMessage != undefined)
            this.playbackMessage.delete();
        delete this.songs;
        this.events.emit("destroyed");
        delete this.voiceChannel;
    }



    /**
     * 
     * Save and loading queues
     * 
     */


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