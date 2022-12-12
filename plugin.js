/*
	 __
	| / . /
	|=\   \  _ _   _
	|_/ | / / | \ |_| .... A Bad Rats playing bot


	Queuer is a 'framework' to handle song queues for the bot.
	My music plugins (YT, etc) utilize this plugin so there's one standard queue.
	Use this as an example on how to create a plugin (or improve on its design)
*/

// Dependencies
const crypto = require('node:crypto'); // Used in hashing queues

var QueueIDs = new Map(); // Queues have unique ID mappings, use this to translate from a ChannelID -> Queue ID
// There can only be one queue per voice channel, and all voice channels have unique IDs, therefor the voice channel ID can be used as the Queue ID,...
// however, if we need to change the voice channel, I don't want to have to create a queue/reassign the ID, so each queue can have a unique randomly generated
// ID and THAT ID (Queue.id) can be mapped using the voice channel ID, that way we just point the new voice channel ID to the existing Queue ID.
// tl;dr: voiceChannelID -> queueID map && guildID -> queueID && 


/*

	- When playing in multiple channels (queues), audio can sometimes get chopped



*/


var Queues = new Map();
var LastQueueID = 0;


/**
 * @typedef {import('./../../bismo.js').BismoCommandExecuteData} BismoCommandExecuteData
 */
/**
 * @typedef {import('./../../bismo.js').BismoRequests} BismoRequests
 */

/**
 * @type {import('./../../bismo.js').Bismo}
 */
var Bismo = {} // Bismo API, provided to use in the main function (under the Requests packet)

var Plugin = {}

const Song = require('./Song');//(Bismo);
const Queue = require('./Queue');


// Plugin API


/**
 * @typedef {object} AdditionalData
 * Used to find a queue if the queue ID is unknown
 * @property {string} guildID Guild the queue is in
 * @property {[string]} voiceChannelID The voice channel the queue is in
 * @property {[VoiceChannel]} voiceChannel The voice channel the queue is in
 * @property {[string]} textChannelID The text channel the queue is linked to (locked to)
 * @property {[TextChannel]} textChannel The text channel the queue is linked to (locked to)
 * @property {[string]} userID Search for a queue with this user in it (User in voice chat? -> Queue for that voice channel? -> Return queue)
 * @property {[boolean]} mustIncludeUser Queue will only be returned *if* userID is a part of the voiceChannel
 */


/**
 * Adds a song to a queue within a guild
 * @param {string} queueID Queue ID, voice chat ID, guild ID, or text channel ID
 * @param {AdditionalData} additionalData Additional data that may be needed to distinguish between multiple guild queues
 * @return {Queue} If found, queue, otherwise undefined
 */
Plugin.GetQueue = function (queueID, additionalData) {

	/**
	 * @param {Queue} queue
	 */
	let checkForUser = function(queue) {
		if (typeof additionalData.userID !== "string" && additionalData.mustIncludeUser == true)
			return undefined;
		if (additionalData.mustIncludeUser) {
			// Check for user
			if (queue.voiceChannel != undefined) {
				if (queue.voiceChannel.memebers.has(additionalData.userID))
					return queue;
				else
					return undefined;
			}
		} else {
			return queue;
		}
		return undefined;
	}


	/**
	 * @type {Queue} queue
	 */
	var queue = Queues.get(queueID);
	if (typeof queueID === "string") {
		if (queue != undefined)
			return queue;
		queueID = QueueIDs.get(queueID);
		if (queueID != undefined) {
			queue = Queues.get(queueID);
			if (typeof queueID === "string") {
				if (queue != undefined)
					return queue;
			}
		}
	}


	// find by additionalData

	if (typeof additionalData !== "object" || additionalData == undefined)
		return undefined;

	let tryThisOne = function(data) {
		if (data != undefined) {
			let queueID = QueueIDs.get(data);
			if (queueID != undefined) {
				return Queues.get(queueID);
			}
		}
		return undefined;
	}

	// Queue ID -> VC ID -> TC ID -> GuildID

	// Voice channel ID?
	queue = tryThisOne(additionalData.voiceChannelID);
	if (queue != undefined)
		checkForUser(queue);
	// Voice channel object?
	queue = tryThisOne(additionalData.voiceChannel);
	if (queue != undefined)
		checkForUser(queue);
	// Text channel ID?
	queue = tryThisOne(additionalData.textChannelID);
	if (queue != undefined)
		checkForUser(queue);
	// Text channel object?
	queue = tryThisOne(additionalData.textChannel);
	if (queue != undefined)
		checkForUser(queue);
	// GuidID?
	queue = tryThisOne(additionalData.guildID);
	if (queue != undefined)
		checkForUser(queue);
}

/**
 * Creates a new queue for a particular guild.
 * @param {AdditionalData} additionalData Additional data required to build the queue (must include the voice channel & text channel)
 * @return {Queue} Newly created queue
 */
Plugin.CreateQueue = function (additionalData) {
	let queue = Plugin.GetQueue(undefined, additionalData);
	if (queue != undefined)
		return queue;

	if (typeof additionalData !== "object")
		throw new TypeError("additionalData expected object got " + (typeof additionalData).toString());
	if (typeof additionalData.guildID !== "string")
		throw new TypeError("additionalData.guildID expected string got " + (typeof additionalData.guildID).toString());
	
	if (additionalData.voiceChannel == undefined)
		if (typeof additionalData.voiceChannelID !== "string")
			throw new TypeError("additionalData.voiceChannelId expected string got " + (typeof additionalData.voiceChannelID).toString());
		else
			additionalData.voiceChannel = Bismo.GetGuildChannelObject(additionalData.guildID, additionalData.voiceChannelID);

	

	if (additionalData.voiceChannel === undefined)
		return undefined;
	else if (additionalData.voiceChannel.type !== "GUILD_VOICE")
		return undefined;


	queue = new Queue(additionalData.voiceChannel, {
		authorId: additionalData.userId,
	});

	queue.on('destroyed', (queueID) => {
		Bismo.log("Queue destroyed.");
		Queues.delete(queueID);
	});

	Queues.set(queue.Id, queue);
	QueueIDs.set(additionalData.voiceChannel.id, queue.Id);
	QueueIDs.set(additionalData.guildID, queue.Id);

	return queue;
}


/**
 * Adds a song to a queue within a guild
 * @param {string} queueID Guild the queue is in
 * @param {Song} song Song object to add to the queue
 * @param {AdditionalData} additionalData Additional data that may be needed to distinguish between multiple guild queues
 * @throws {Queue.NoSuchSong} Song data invalid
 */
Plugin.AddSong = function (queueID, song, additionalData) {
	let queue = Plugin.GetQueue(queueID, additionalData);
	if (queue == undefined)
		queue = Plugin.CreateQueue(additionalData)

	return queue.Add(song);
}


// Chat commands


/**
 * @param {BismoCommandExecuteData} message
 */
function MainHandler(message) {
	message.parser.IsPresent("")
}




/**
 * @param {BismoRequests} Requests
 */
function main(Requests) {
	Bismo = Requests.Bismo // The Bismo API


	Bismo.RegisterCommand("queuer", MainHandler, {
		description: "Manage the voice channel audio queue.",
		helpMessage: "Usage: \`!queuer [options]\`"
						+ "\nWork in progress."
						+ "\nOptions:"
						+ "\n\`view\`: View current queue"
						+ "\n\`next\`:"
						+ "\n\`prev\`:"
						+ "\n\`pause\`:"
						+ "\n\`play\`:"
						+ "\n\`stop\`: Stops playback (queue head points to first song)"
						+ "\n\`end\`: Destroys the queue, leaves the voice channel",
		requireParams: false,
		guildRequried: true,
		slashCommand: false,
	});
}





module.exports = {
	requests: {

	},
	main: main,
	manifest: {
		name: "Queuer",
		packageName: "com.watsuprico.queuer",
		author: "Watsuprico",
		date: "4/1/2022",
		version: "2"
	},
	api: Plugin
}