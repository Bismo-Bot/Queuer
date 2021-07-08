// Song 'class'

const Bismo;
const Queuer;

const Discord = require("discord.js");
const Song = require('./song');//(Bismo);

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
     * @typedef {Discord.VoiceChannel} VoiceChannel
     */

    /**
     * VoiceConnection object for the voice channel
     * @type {VoiceConnection}
     */
    voiceConnection;

    /**
     * The ID for the playback message (used to update playback statuses)
     * @type {string}
     */
    playbackMessageID;

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
     * The text channel we're subscribed to (to send updates to / listen to updates)
     * @type {TextChannel}
     */
    textChannel;

    /**
     * The voice channel we're connected to
     * @type {VoiceChannel}
     */
    voiceChannel;



    constructor(data) {

    }


    /**
     * Begins playing / resumes the queue in the assigned voice channel
     * 
     * Moves the queue to the provided song and plays it
     * 
     * @param {Song | number} [song] - The song to begin playing
     */
    Play(song) {

    }

    /**
     * Pauses the queue
     * (If song is provided then the queue is only paused if that song is playing)
     * @param {Song | number} [song] - The song to begin playing
     */
    Pause(song) {

    }

    /**
     * Skips the currently playing song in the queue. If paused, begins playback.
     * (If song is provided then the song is only skipped if playing)
     * @param {Song | number} [song] - The song to begin playing
     */
    Skip(song) {

    }

    /**
     * Adds a song to the queue
     * @param {Song} song - The song to be added to the queue
     * @param {AddOptions} options - Additional options for adding the song
     */
    Add(song, options) {

    }

    /**
     * Toggle repeat mode for the queue/song. No repeat -> queue repeat -> song repeat
     * 
     * @param {boolean} [enable] - If defined the repeat status will be set to this value.
     * @param {boolean} [track = false] - Whether or not to set status to the track or queue. (Default queue)
     * 
     */
    Repeat(enable, track) {

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

    }

    /**
     * Disconnects the bot from the voice chat, cleans up the playback message, and destroys the queue.
     * 
     */
    Destroy() {

    }

    /**
     * Updates the playback message to show the current playback status.
     * 
     */
    UpdatePlaybackMessage() {

    }

}

module.exports = Queue;