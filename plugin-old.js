
/*
	 __
	| / . /
	|=\   \  _ _   _
	|_/ | / / | \ |_| .... A Bad Rats playing bot


	Queuer is a 'framework' to handle song queues for the bot.
	My music plugins (YT, etc) utilize this plugin so there's one standard queue.
	Use this as an example on how to create a plugin (or improve on its design)
*/

var Bismo = {} // Bismo API, provided to use in the main function (under the Requests packet)

const Plugin = {
	queue: [],			// Per-Guild data goes here, has info such as the song queue, active, vc, etc.
}



// Dependencies
const crypto = require('crypto'); // Used in hashing queues

Queues = new Map();
var savedQueues = {};
var playbackMessages = [];


/*
	Sample song (queue) entry:

	{
		id: 0,		// We add this. This is essential WHEN the song was added (I.E. 0=first song added, 1=second, ...) When we disable shuffle, we move the songs to THIS index (so songs[id]=this)

		title: "Rick Astley - Never Gonna Give You Up",	// Needed
		uploader: "Official Rick Astley",				// Perhaps?
		timeStamp: "3:32",								// Needed
		packageName: "com.watsuprico.youtube",			// The plugin that added this to the queue (so we can then tell that plugin to play X song)

		loop: false,									 // Used by Queuer


		// Required functions, (you should also include an API call in your plugin for these, EX: Plugin.playSong(queue, song))
		play: function(queue),					// When called, this will stream the URL/song into the connection. The streaming plugin sets this function up.
		pause: function(queue),					// When called, this will pause any streaming music. ""
		resume: function(queue),				// When called, this will resume any streaming music. ""


		// The plugin adding this song to queue can keep any additional information as they see fit.

		//YT
		url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

		// If you require an object to store runtime information in, use the below name. This will not be saved to disk.
		playData: {--your data here--}, // This WILL NOT be saved.

		// If you require data to be store persistently, use the below name
		persistentData: {
			url: ""
		}

		// The ONLY time song stream data can be stored here is IF the song is actively being streamed. Even then you shouldn't do it, that's just stupid.
	}


	We do not drop anything from queue unless requested, (!que remove <prev | cur | next>)
	We have an internal counter quePos that tells use our current queue position
*/


function mainHandler(message) {
	var args = message.args;
	var gA = function(a) { return a != null ? a : ""; } // g(et)A(rg)

	var cmd = gA(args[0]);

	queueID = message.author.id;
	if (message.guild)
		queueID = message.guild.id;

	var serverQueue = Queues.get(message.guild.id);

	// Wrapper for playStreamFunction
	playStreamFunc = function(stream) {
		playStreamFunction(message.guild.id, serverQueue.songs[serverQueue.currentSong], stream);
	}

	var vc = undefined;
	if (message.message.member != undefined)
		if (message.message.member.voice != undefined)
			vc = message.message.member.voice.channel;
	
	if (vc == undefined)
		return message.reply("You must join a voice channel first.");


	if (cmd == "leave" || cmd == "l") { // Updated
		if (message.guild.voice.channel)
			message.guild.voice.channel.disconnect();

		if (serverQueue) {
			serverQueue.notify(true);
			Queues.delete(message.guild.id);
		}

		message.message.react('🖖');
		return;
	}

	// Create queue if needed.
	function cFQ() {
		if (!serverQueue) {
			// Create a queue
			serverQueue = Plugin.createQueue(message.guild.id, { voiceChannel: message.member.voice.channel, textChannel: message.channel });
			message.message.react('⭕');
		}
	}
	

	// Queuer commands
	if (cmd == "clear" || cmd == "stop" || cmd == "end") { // Updated
		// End the queue
		if (serverQueue) {
			if (serverQueue.voiceChannel)
				serverQueue.voiceChannel.leave();
			serverQueue.notify(true);

			Queues.delete(message.guild.id);
			return message.message.react("🖖");
		} else {
			return message.message.react("⁉️");
		}
	}

	else if (cmd == "queue" || cmd == "view") { // Updated
		cFQ();
		let q = serverQueue;
		if (parseInt(args[1])=="NaN" && gA(args[1]) != "") {
			let package = getSavedQueueID(name, message.guild.id, message);
			if (package.id != undefined && package.savedQueue != undefined)
				q = package.savedQueue;
		}


		let max = (q.songs.length < 21) ? q.songs.length : 20;

		let items = 5 // default to 5
		let loopItems = 0; // Number of items looped over (at the beginning) that should be displayed

		if (parseInt(gA(args[1])) != "NaN")
			startAt = parseInt(gA(args[1]));


		var str = "Now playing: _" + q.songs[q.currentSong].title + "_";
		if (q.songs[q.currentSong].loop) {
			str += " 🔂";
		}
		str += " (added by: " + q.songs[q.currentSong].addedByUsername + ")\n";


		if (items >= max) {
			items = max;
		}
		if (items + q.currentSong > q.songs.length - 1)
			if (q.loop)
				loopItems = q.songs.length - 1 - items;


		if (items > 1) {
			for (var i = q.currentSong + 1; i < items; i++) {
				str = str + "[" + (i + 1) + "]" + ": _" + q.songs[i].title.substring(0, 60) + "_ (`" + q.songs[i].timeStamp + "`, added by " + q.songs[i].addedByUsername + ").\n";
			}
			if (loopItems > 0) {
				str += "--- beginning ---";
				for (var i = 0; i < loopItems; i++) {
					str = str + "[" + (i + 1) + "]" + ": _" + q.songs[i].title.substring(0, 60) + "_ (`" + q.songs[i].timeStamp + "`, added by " + q.songs[i].addedByUsername + ").\n";
				}
			}
		}

		str = str + "_(There's a total of " + (q.songs.length - q.currentSong) + " songs currently queued.)_";

		return message.reply(str);

	} else if (cmd == "song" || cmd == "info") {
		cFQ();

		let song = serverQueue.songs[serverQueue.currentSong];
		if (gA(args[1]) != "") {
			let index = parseInt(args[1]);
			if (index != "NaN") {
				index -= 1;
				song = serverQueue.songs[index];
			}
		}

		if (song != undefined) {
			message.reply("_" + song.title + "_ (" + song.timeStamp + ") was uploaded by " + song.addedByUsername + ". ");
			return message.message.react('👌');
		}


	// CONTROLS - BASIC

	} else if (cmd == "skip" || cmd == "next") { // Fine.
		cFQ();
		let l = serverQueue.loop;
		serverQueue.songs[serverQueue.currentSong].loop = false;
		serverQueue.loop = true;
		serverQueue.next(); // let that function deal with it.
		serverQueue.loop = l;

	} else if (cmd == "previous" || cmd == "prev" || cmd == "back") { // Fine
		cFQ();
		if (serverQueue.currentSong == 0)
			serverQueue.currentSong = serverQueue.songs.length - 1;
		else
			serverQueue.currentSong--;
		serverQueue.songs[serverQueue.currentSong].play(playStreamFunc, serverQueue);

	} else if (cmd == "pause" || cmd == "pa" || cmd == "hold") {
		cFQ();
		serverQueue.dispatcher.pause();
		serverQueue.paused = true;
		serverQueue.notify();
		// return message.react("⏸️");

	} else if (cmd == "play" || cmd == "pl" || cmd == "go" || cmd == "resume") {
		cFQ();
		serverQueue.dispatcher.resume();
		serverQueue.paused = false;
		serverQueue.notify();
		// return message.react("▶️");

	} else if (cmd == "playpause" || cmd == "pp" || cmd == "pauseplay" || cmd == "toggle") {
		cFQ();
		if (serverQueue.dispatcher.paused) {
			serverQueue.dispatcher.resume();
			serverQueue.paused = false;
			serverQueue.notify();
			// return message.react("▶️");
		}
		else {
			serverQueue.dispatcher.pause();
			serverQueue.paused = true;
			serverQueue.notify();
			// return message.react("⏸️");
		}

	} else if (cmd == "volume" || cmd == "vol") { // Works
		cFQ();
		if (parseInt(args[1]) != "NaN") {
			var vol = parseInt(args[1]);
			if (vol > 200)
				vol = 100;
			if (vol <= 0)
				vol = .1;

			serverQueue.volume = vol;
			serverQueue.dispatcher.setVolumeLogarithmic(serverQueue.volume / 100);
		}


	// QUEUE CONTROLS - BASIC

	} else if (cmd == "shuffle") { // Fine
		cFQ();
		// Toggle shuffle
		if (serverQueue.shuffle) {
			// Undo shuffle
			var tSongs = [...serverQueue.songs];

			serverQueue.currentSong = serverQueue.songs[serverQueue.currentSong].id; // This will point to the right song AFTER we undo the shuffle

			for (var i = 0; i < tSongs.length; i++) {
				serverQueue.songs[tSongs[i].id] = tSongs[i];
			}

			serverQueue.shuffle = false;
			serverQueue.notify();
			message.message.react("🙅‍♂️")
			return message.message.react("🔀");
		} else {
			for (let i = serverQueue.songs.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[serverQueue.songs[i], serverQueue.songs[j]] = [serverQueue.songs[j], serverQueue.songs[i]];
			}

			// move the current song to the beginning
			for (let i = 0; i < serverQueue.songs.length; i++) {
				if (serverQueue.songs[i].id == serverQueue.currentSong) {
					[serverQueue.songs[0], serverQueue.songs[i]] = [serverQueue.songs[i], serverQueue.songs[0]]; // Swap the start of the queue with our current song (since the current SHOULD be the top)
					serverQueue.currentSong = 0; // We're now playing from the beginning.
					break;
				}
			}

			serverQueue.shuffle = true;
			serverQueue.notify();
			return message.message.react("🔀");
		}

		// Shuffle

	} else if (cmd == "loop" || cmd == "repeat") {
		cFQ();
		let sub = gA(args[1]);

		if (sub == "track" || sub == "t" || sub == "song" || sub == "s") {
			// Loop track
			serverQueue.loop = false;
			let looped = serverQueue.songs[serverQueue.currentSong].loop = !serverQueue.songs[serverQueue.currentSong].loop;

			serverQueue.notify();
			if (looped)
				message.message.react('🔂');
			else {
				message.message.react('🙅‍♂️');
				message.message.react('🔂');
			}

		} else if (sub == "queue" || sub == "q") {
			// Queue
			serverQueue.songs[serverQueue.currentSong].loop = false;
			let looped = serverQueue.loop = !serverQueue.loop;

			serverQueue.notify();
			if (looped)
				message.message.react('🔁');
			else {
				message.message.react('🙅‍♂️');
				message.message.react('🔁');
			}

		} else {
			// Don't worry about it, toggle
			if (serverQueue.loop) {
				// Loop song.
				serverQueue.loop = false;
				serverQueue.songs[serverQueue.currentSong].loop = true;
				message.message.react('🔂');

			} else if (serverQueue.songs[serverQueue.currentSong].loop) {
				// No loop
				serverQueue.loop = false;
				serverQueue.songs[serverQueue.currentSong].loop = false;
				message.message.react('🙅‍♂️');
				message.message.react('🔁');

			} else {
				// Loop queue
				serverQueue.loop = true;
				serverQueue.songs[serverQueue.currentSong].loop = false;
				serverQueue.notify();
				message.message.react('🔁');

			}

		}

		return; // loop



	} else if (cmd == "move" || cmd == "mv") {
		cFQ();
		if (gA(args[1]) != "" && gA(args[2]) != "") {
			let indexA = parseInt(args[1]);
			let indexB = parseInt(args[2]);
			if (indexA != "NaN" && indexB != "NaN") {
				indexA -= 1;
				indexB -= 1;
				if ((indexA < serverQueue.songs.length && indexA >= 0) && (indexB < serverQueue.songs.length && indexB >= 0)) {
					[serverQueue.songs[indexA], serverQueue.songs[indexB]] = [serverQueue.songs[indexB], serverQueue.songs[indexA]];
				}
			}
		}

	} else if (cmd == "jump") {
		cFQ();
		if (gA(args[1]) != "") {
			let index = parseInt(args[1]);
			if (index != "NaN") {
				index -= 1;
				if (index < serverQueue.songs.length && index >= 0) {
					serverQueue.currentSong = index;
					playStreamFunc = function(stream) {
						playStreamFunction(message.guild.id, serverQueue.songs[index], stream);
					}
					serverQueue.songs[index].play(playStreamFunc, serverQueue);
					return message.message.react('👌');
				}
			}
		}

	} else if (cmd == "remove" || cmd == "rm" || cmd == "del" || cmd == "delete") { // Updated
		cFQ();
		//queueID, index, options

		// - q remove|rm|del|delete <startID> <endID>: Removes a song from index <startID> to <endID>
		// - q remove|rm|del|delete song|s <title>: Remove the song with the title <title>. Exact matches only (not case sensitive).
		// - q remove|rm|del|delete next|n: Remove the next song
		// - q remove|rm|del|delete current|cur|c: Removes the current song (and goes to the next song)
		// - q remove|rm|del|delete previous|prev|p: Removes the previous song

		let sCMD = gA(args[1]);

		function sR(index, options) {
			let o = options;

			if (o == undefined)
				o = {};

			o.react = message.message.react;

			Plugin.removeSong(serverQueue.queueID, index, o);
		}

		if (sCMD == "previous" || sCMD == "p") {
			let index = serverQueue.currentSong;
			if (index < 0)
				index = serverQueue.songs.length - 1;
			sR(index);
		} else if (sCMD == "current" || sCMD == "cur" || sCMD == "c") {
			sR(serverQueue.currentSong);
		} else if (sCMD == "next" || sCMD == "n") {
			let index = serverQueue.currentSong;
			if (index > serverQueue.songs.length - 1)
				index = 0;
			sR(index);
		} else if (sCMD == "song" || sCMD == "s") {
			// song title
			sR(args.slice(1).join(" ").toLowerCase(), { indexIsTitle: true });
		} else if (parseInt(sCMD) != "NaN") {
			let index = parseInt(sCMD);
			let count = parseInt(args[2]);
			let options = {};

			if (count != "NaN") {
				if (count < index) {
					// flip numbers around
					index = index + count;
					count = index - count;
					index = index - count;
				}
				count = count - index; // delete 'count' songs
				options.count = count;
			}

			// check bounds
			let max = serverQueue.songs.length - 1;
			if (index > max || index < 0)
				return message.reply("Sorry, that song doesn't exist.");

			if (count != "NaN")
				if (index + count > max) {
					count = max - index;
					options.count = count;
				}

			sR(index-1, options);

		} else if (sCMD == "help" || sCMD == "h" || sCMD == "?") {
			message.reply("Usage: !q rm [previous | current | next | song | <position>] [lastID | title...]\n"
				+ " previous (p): Removes the previous song\n"
				+ " current (c): Removes the current song (and plays the next)\n"
				+ " next (n): Removes the next song\n"
				+ " song (s): Removes a song with the provided title. Exact match.\n"
				+ " <position>: The song index you wish to remove, you can then provide the [lastID] to remove a range of songs.");

		} else {
			// what the fuck are they deleting?
			message.reply("Incorrect usage. For help, run `!q rm ?`");
		}

		return; // Remove

	

	} else if (cmd == "save" || cmd == "saveq" || cmd == "sq") { // Default is to save this as a personal queue.
		var saveLocation = "personal";
		var scmd = args[1];

		function sQ(name) {
			let package = getSavedQueueID(name, message.guild.id, message);
			console.log(package.id);
			console.log(package.location);
			if (package.id!=undefined && package.location == saveLocation)
				message.getReply("A queue with this name already exists, would you like to override it? (yes/no)", msg => {
					msg.delete();

					if (msg.content.toLowerCase().startsWith("y")) {
						if (saveQueue(serverQueue, name, message, saveLocation)) {
							return message.reply("Queue successfully saved! To load this queue, run: `!q load " + name + "`.");
						} else {
							return message.reply("Failed to save queue!");
						}
					}
				});


			if (saveQueue(serverQueue, name, message, saveLocation)) {
				return message.reply("Queue successfully saved! To load this queue, run: `!q load " + name + "`.");
			} else {
				return message.reply("Failed to save queue!");
			}
		}

		function checkName() {
			if (gA(args[2]) == "") {
				// return message.reply("What would you like the name to be?");
				message.getReply("What would you like the name to be?", msg => {
					var name = msg.content;
					sQ(name);
				});
			} else {
				var name = args.slice(2).join(" ");
				sQ(name);
			}
		}

		if (gA(scmd) == "") {
			// return message.reply("What would you like the name to be?");
			message.getReply("What would you like the name to be?", msg => {
				var name = msg.content;
				sQ(name);
			});

		} else if (scmd == "personal") {
			// Save to personal
			checkName();

		} else if (scmd == "server" || scmd == "s" || scmd == "guild" || scmd == "g") {
			// Save to server
			saveLocation = "guild"
			checkName();

		} else if (scmd == "server-private" || scmd == "sp" || scmd == "guild-private" || scmd == "gp") {
			// Save to server, but private
			saveLocation = "guildP"
			checkName();

		} else {
			var name = args.slice(1).join(" ");
			sQ(name);
		}


	} else if (cmd == "load" || cmd == "loadq" || cmd == "lq") {
		if (gA(args[1]) == "") {
			message.getReply("What's the name of the queue you're trying to load?", msg => {
				var name = msg.content;
				loadQueue(name, message.guild.id, message);
			});
		} else {
			var name = args.slice(1).join(" ");
			loadQueue(name, message.guild.id, message);
		}

	} else if (cmd == "deletequeue" || cmd == "delq" || cmd == "dq") {
		if (gA(args[1]) == "") {
			message.getReply("What's the name of the queue you're trying to load?", msg => {
				var name = msg.content;
				deleteQueue(name, message.guild.id, message);
			});
		} else {
			var name = args.slice(1).join(" ");
			deleteQueue(name, message.guild.id, message);
		}

	} else if (cmd == "share" || cmd == "sharequeue" || cmd == "shareq" || cmd == "shq") {
		function sQ(name) {
			let package = getSavedQueueID(name, message.guild.id, message);
			if (package.id!=undefined)
				message.reply("Share code: `" + package.id + "`. Just run `!q lq " + package.id + "` to load this queue anywhere.");
			else
				message.reply("Unable to find a saved queue by that name.");
			return;
		}

		if (gA(args[1]) == "") {
			message.getReply("What's the name of the queue you're trying to load?", msg => {
				var name = msg.content;
				sQ(name);
			});
		} else {
			var name = args.slice(1).join(" ");
			sQ(name);
		}

	}

}


/*	
	You can save a queue to three places:
		ServerPrivate: 	This queue belongs to whoever saves it, but, they can only revive it in this server.
		Server: 		This queue belongs to the guild, any guild member can revive it.
		Personal: 		This queue belongs to whoever saves it, they can revive it anywhere.
	These are sorted in the way we lookup saved queues. First we check the server-p storage, then server, then their personal storage.
	

	How we save queues:
	IF saved with the author:	hash(authorID + name): simple as that.
	IF saved with the guild: 	hash(guildID + name)

	The author can retrieve the queue anytime anywhere

*/
function saveQueue(queue, name, message, saveLocation) {
	if (!queue)
		return false;
	if (!name)
		return false;
	if (!message)
		return false;

	name = name.toLowerCase();

	let ID = crypto.createHash('md5').update(name + message.author.id).digest('hex');
	if (saveLocation == "guild")
		ID = crypto.createHash('md5').update(name + queue.queueID).digest('hex');
	else if (saveLocation == "guildP")
		ID = crypto.createHash('md5').update(queue.queueID + message.author.id + name).digest('hex');

	var cleanQueue = {}; //{...queue};
	cleanQueue.songs = [];
	cleanQueue.volume = queue.volume;
	cleanQueue.paused = queue.paused;
	cleanQueue.queueID = queue.queueID;
	cleanQueue.currentSong = queue.currentSong;
	cleanQueue.author = message.author.id;
	cleanQueue.guildID = message.guild.id;
	cleanQueue.saveLocation = saveLocation;

	for (var i = 0; i < queue.songs.length; i++) {
		cleanQueue.songs[i] = {};
		cleanQueue.songs[i].id = queue.songs[i].id;
		cleanQueue.songs[i].title = queue.songs[i].title;
		cleanQueue.songs[i].uploader = queue.songs[i].uploader;
		cleanQueue.songs[i].timeStamp = queue.songs[i].timeStamp;

		cleanQueue.songs[i].packageName = queue.songs[i].packageName;
		cleanQueue.songs[i].presistentData = {...queue.songs[i].presistentData};
		cleanQueue.songs[i].loop = queue.songs[i].loop;
		
		cleanQueue.songs[i].addedBy = queue.songs[i].addedBy;
		cleanQueue.songs[i].addedByUsername = queue.songs[i].addedByUsername;
	}

	savedQueues[ID] = cleanQueue;

	Bismo.WriteConfig(savedQueues, undefined, "savedQueues");

	return true;
}

function getSavedQueueID(name, guildID, message) {
	let location = "share-key";
	let ID = name; // see if they gave us the ID
	let savedQueue = savedQueues[ID];

	if (savedQueue == undefined) {
		ID = crypto.createHash('md5').update(name + message.author.id).digest('hex');
		savedQueue = savedQueues[ID];
		location = "personal";
	}
	if (savedQueue == undefined) {
		ID = crypto.createHash('md5').update(name + guildID).digest('hex');
		savedQueue = savedQueues[ID];
		location = "guild";
	}
	if (savedQueue == undefined) {
		ID = crypto.createHash('md5').update(guildID + message.author.id + name).digest('hex');
		savedQueue = savedQueues[ID];
		location = "guildP";
	}

	if (savedQueue == undefined) {
		return {};
	} else {
		return { id: ID, location: location, savedQueue: savedQueue };
	}
}

function deleteQueue(name, guildID, message) {
	let idPackage = getSavedQueueID(name, guildID, message);
	let ID = idPackage.id;

	if (ID!=undefined) {
		delete savedQueues[ID];
		message.react('👌');
		Bismo.WriteConfig(savedQueues, undefined, "savedQueues");
	} else
		message.reply("No queue was found to delete.");
}

/**
 * Loads a queue
 * @param {string} name - Name of the saved queue.
 * @param {Discord.ID} guildID - The ID of the guild the queue will be in
 * @param {Discord.message} message - The message that includes the command to load a saved queue (used to find the author ID, voice and text channel)
 */
function loadQueue(name, guildID, message) {
	name = name.toLowerCase();

	let idPackage = getSavedQueueID(name, guildID, message);
	let savedQueue = idPackage.savedQueue;

	if (savedQueue == undefined) {
		message.reply("I couldn't find that saved queue!");
		return;
	}

	let voiceChannel = message.member.voice.channel;
	if (!voiceChannel)
		return message.reply("You must join a voice channel first.");

	let permissions = voiceChannel.permissionsFor(message.client.user);
 	if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
		return message.reply("I cannot join and speak in your voice channel, try a different one.");
	}

	// just add these songs to the queue (this creates one if none exists, or adds to the existing queue :) )
	//Queuer.addSong(message.guild.id, song, {
	//			reply: message.reply,
	//			voiceChannel: voiceChannel,
	//			textChannel: message.channel,
	//			userID: message.author.id
	//		});

	var pluginHandles = {};
	for (var i = 0; i<savedQueue.songs.length; i++) {
		if (savedQueue.songs[i] != undefined) {
			if (pluginHandles[savedQueue.songs[i].packageName] == undefined)
				pluginHandles[savedQueue.songs[i].packageName] = Bismo.GetPlugin(savedQueue.songs[i].packageName, true);

			if (typeof pluginHandles[savedQueue.songs[i].packageName].setSong == "function") {
				let s = pluginHandles[savedQueue.songs[i].packageName].setSong(savedQueue.songs[i]);
				if (s != undefined) {
					Plugin.addSong(guildID, s, {
						voiceChannel: voiceChannel,
						textChannel: message.channel,
						userID: message.author.id,
					});
				}

			}
			else {
				// Plugin doesn't support loading song
			}

		} else {
			// Song undefined
		}


	}

	

	message.reply("Saved queue loaded!");
}


function playStreamFunction(queueID, song, stream) {
	
	serverQueue = Queues.get(queueID);

	console.log("[ Queuer ] Playing: qID: " + queueID + " || index: " + serverQueue.currentSong);

	if (song == undefined) {
		serverQueue.voiceChannel.leave();
		serverQueue.notify(true);
		Queues.delete(queueID);
		return;
	}

	var dispatcher = serverQueue.connection
		.play(stream)
		.on('finish', () => {
			console.log("[ Queuer ] (" + queueID + "#" + serverQueue.currentSong + ") finished");
			serverQueue.next();
			serverQueue.notify();
		})
		.on('error', error => {
			console.log(error);
		});

	serverQueue.dispatcher = dispatcher;
	dispatcher.setVolume(serverQueue.volume / 100);
}

/*
	Queue data {
		textChannel,
		voiceChannel,
		song
	}
*/
Plugin.createQueue = function(queueID, queueData) {
	if (queueData == undefined || queueID == undefined) {
		console.error("QUEUER-CREATEQUEUE-1: Properties not provided correctly.");
		return undefined;
	}
	if (queueData.textChannel == undefined || queueData.voiceChannel == undefined) {
		console.error("QUEUER-CREATEQUEUE-2: Properties not provided correctly.");
		return undefined;
	}


	var queue = {
		connection: null,
		songs: [], // This is essentially the queue
		volume: 50,
		paused: true,
		queueID: queueID,
		currentSong: 0,
		textChannel: queueData.textChannel,
		voiceChannel: queueData.voiceChannel,
	};

	queue.notify = function(del) {
		function removeReaction(reaction, leaveOne) {
			if (queue.playbackMessage!=undefined)
				queue.playbackMessage.reactions.cache.each(r => { // For each reaction
					if (r._emoji.name == reaction) {
						if (leaveOne)
							r.users.cache.each(u => {
								if (u.id != Bismo.botID)
									r.users.remove(u);
							});
						else // remove reaction
							r.remove();
					}
				});
		}

		// Update playtime message;
		let queue = Queues.get(queueID); // updated

		if (queue != undefined)
			return;
		if (queue.playbackMessage==undefined)
			return;

		queue.textChannel.messages.fetch(queue.playbackMessage.id).then(msg => {
			if (msg!=undefined) {
				if (del) {
				let msg = queue.playbackMessage;
				if (msg != undefined) {
					if (queue.collector)
						queue.collector.stop() // Stop reaction collector.

					msg.unpin({ reason: "Playback concluded." }).catch(OcO => { });
					msg.delete({ reason: "Playback concluded." }).catch(OcO => { });
				}
				return;
			}
			let str = "No song currently playing";
			if (queueData.song != undefined)
			if (typeof queueData.song.play === "function") {
					str = "Currently " + ((queue.paused) ? "paused" : "playing") + " `" + queue.songs[queue.currentSong].title + "`."
					str += "\nAdded by " + (queueData.song.addedByUsername || "???") + "\n";
				}

			if (queue.shuffle) {
				str += "🔀 ";
				queue.playbackMessage.react('🔀');
				removeReaction('🔀', true);
			} else {
				removeReaction('🔀');
			}

			if (queue.loop) {
				str += "🔁 ";
				queue.playbackMessage.react('🔁');
				removeReaction('🔁', true);
			} else if (queue.songs[queue.currentSong] != undefined) {
				if (queue.songs[queue.currentSong].loop) {
					str += "🔂 ";
					queue.playbackMessage.react('🔂');
					removeReaction('🔂', true);
				}
			} else {
				removeReaction('🔁');
				removeReaction('🔂');
			}

			if (queue.paused) {
				queue.connection.setSpeaking(0);
				queue.playbackMessage.react('▶️');
				removeReaction('▶️', true);
				removeReaction('⏸️');
			} else {
				queue.connection.setSpeaking(1);
				queue.playbackMessage.react('⏸️');
				removeReaction('⏸️', true);
				removeReaction('▶️');
			}

			queue.playbackMessage.edit(str);
			}
		
		});

	};

	playStreamFunc = function(stream) {
		playStreamFunction(queueID, queueData.song, stream);
	}

	queue.next = function() {
		if (Queues.get(queueID) == undefined) {
			return;
		}

		// either loop the song, continue to the next track, loop the queue, or end
		if (queue.songs[queue.currentSong].loop) {

			queue.songs[queue.currentSong].play(playStreamFunc, queue); // just play it again
			serverQueue.notify();

		} else if (queue.currentSong == queue.songs.length - 1) {
			// this is the end of the queue,
			if (queue.loop) {
				queue.currentSong = 0; // loop around
				queue.songs[0].play(playStreamFunc, queue);
				serverQueue.notify();
			} else {
				// At the end.
				try {
					queue.playbackMessage.edit("Queue finished.");
				} catch(e) {}
				
				queue.paused = true;
				queue.currentSong = 0;

			}
		} else {
			if (queue.currentSong >= queue.songs.length) {
				try {
					queue.playbackMessage.edit("Queue finished.");
				} catch(e) {}
				queue.paused = true;
				queue.currentSong = 0;

			} else {
				// Next track
				queue.currentSong++;
				queue.songs[queue.currentSong].play(playStreamFunc, queue);
				serverQueue.notify();
			}
		}

	}

	if (queueData.song!=undefined) {
		queueData.song.id = 0;
		queue.songs.push(queueData.song);
	}

	Queues.set(queueID, queue);

	try {
		queue.voiceChannel.join().then(connection => {
			queue.connection = connection;
			let str = "No song currently playing";

			if (queueData.song != undefined) {
				if (typeof queueData.song.play==="function") {
					queueData.song.play(playStreamFunc, queue);
					str = "Currently playing `" + queueData.song.title + "`\n. Added by " + (queueData.song.addedByUsername || "???");
				}
			}
	
			// queueData.reply("`" + song.title + "` has been added to the queue, ID: [`0`].");
			queue.textChannel.send(str).then(msg => {
				queue.playbackMessage = msg;

				playbackMessages.push({ msgID: msg.id, channelID: msg.channel.id });
				Bismo.WriteConfig(playbackMessages, undefined, "playbackMessages");

				if (msg.pinnable)
					msg.pin({ reason: 'Displaying current playback information.' });

				msg.react('⏭️').then(() =>{
					queue.notify();
				});
				const filter = (reaction, user) => {
					return ['▶️', '⏸️', '🔀','  🔁','🔂  ','⏭️  ','⏮️  '].includes(reaction.emoji.name) && !user.bot;
				};
				queue.collector = msg.createReactionCollector(filter);

				queue.collector.on('collect', r => {
					if (queue == undefined) {
						queue.collector.stop();
						return;
					}

					let name = r._emoji.name
					if (name == "▶️") {
						// Play
						serverQueue.dispatcher.resume();
						serverQueue.paused = false;
						r.remove();

					} else if (name == "⏸️") {
						// Pause

						serverQueue.dispatcher.pause();
						serverQueue.paused = true;
						r.remove();


					} else if (name == "🔀") {
						// Shuffle
						if (queue.shuffle) {
							// Undo shuffle
							var tSongs = [...queue.songs];

							queue.currentSong = queue.songs[queue.currentSong].id; // This will point to the right song AFTER we undo the shuffle

							for (var i = 0; i < tSongs.length; i++) {
								queue.songs[tSongs[i].id] = tSongs[i];
							}

							queue.shuffle = false;
							queue.notify();
						} else {
							for (let i = queue.songs.length - 1; i > 0; i--) {
								const j = Math.floor(Math.random() * (i + 1));
								[queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
							}

							// move the current song to the beginning
							for (let i = 0; i < queue.songs.length; i++) {
								if (queue.songs[i].id == queue.currentSong) {
									[queue.songs[0], queue.songs[i]] = [queue.songs[i], queue.songs[0]]; // Swap the start of the queue with our current song (since the current SHOULD be the top)
									queue.currentSong = 0; // We're now playing from the beginning.
									break;
								}
							}

							queue.shuffle = true;
							queue.notify();
						}

					} else if (name == "🔁") {
						// Repeat
						if (queue.loop) {
							queue.songs[queue.currentSong].loop = true;
							queue.loop = false;
							queue.notify();
						} else {
							queue.songs[queue.currentSong].loop = false;
							queue.loop = true;
							queue.notify();
						}

					} else if (name == "🔂") {
						// Repeat song
						if (queue.songs[queue.currentSong].loop) {
							queue.songs[queue.currentSong].loop = false;
							queue.loop = false;
							queue.notify();
						} else {
							queue.songs[queue.currentSong].loop = true;
							queue.loop = false;
							queue.notify();
						}

					} else if (name == "⏭️") {
						r.remove();
						queue.next();
					} else if (name == "⏮️") {
						if (queue.currentSong == 0)
							queue.currentSong = queue.songs.length - 1;
						else
							queue.currentSong--;
						queue.songs[queue.currentSong].play(playStreamFunc, queue);
						r.remove();
					}

					if (typeof queue.notify != "function")
						queue.collector.stop();
					else
						queue.notify();

				})
			});
		});

		return queue;
	} catch (error) {
		console.log(error);
		if (queue.playbackMessage != undefined)
			queue.playbackMessage.delete();
		Queues.delete(queueID);
		if (queueData.reply != undefined)
			queueData.reply("Failed to connect the the voice channel :(");
		return false;
	}
}

/*
	queueData should have:
	{
		voiceChannel,
		textChannel,
		userID,
		reply, // Our reply function (like message.reply())
	}
*/
Plugin.addSong = function(queueID, song, queueData) {	// Queue data is required if no queue is active. Queue data is just the voice and text channel we bind to.
	serverQueue = Queues.get(queueID);

	if (song==undefined)
		return;

	Bismo.log("New song added to queue. Title: " + song.title);


	if (!serverQueue) {
		// No queue set

		queueData.song = song;
		Plugin.createQueue(queueID, queueData);


	} else {
		song.id = serverQueue.songs.length;
		serverQueue.songs.push(song);
		if (queueData.reply != undefined) {
			var index = serverQueue.songs.length - 1;
			queueData.reply("`" + song.title + "` has been added to the queue, ID: [`" + index + "`].");
		}
		return true;
	}
}


/*
	options {
		indexIsTitle,
		reply, // Reply function
		reaction, // React function (ok-hand)
		count, // Number of entries to remove
	}
*/
Plugin.removeSong = function(queueID, index, options) {
	serverQueue = Queues.get(queueID);

	var options = options || {};

	if (options.indexIsTitle) {
		for (var i = 0; i < serverQueue.songs.length; i++) {
			if (serverQueue.songs[i].title == index) {
				index = i;
				break;
			}
		}
	}

	if (index > -1 && index < serverQueue.songs.length) {
		var title = serverQueue.songs[index].title;
		serverQueue.songs.splice(index, 1); // Drops this from the queue
		if (options.reply != undefined) {
			options.reply("`" + title + "` has been successfully removed from the queue.");

		} else if (options.reaction != undefined) {
			options.react('👌');

		}

		return true;
	}

	if (options.reply != undefined)
		options.reply("Failed to remove entry from queue.");

	return false;
}





function main(Requests) {
	Bismo = Requests.Bismo // The Bismo API


	savedQueues = Bismo.ReadConfig("savedQueues");
	playbackMessages = Bismo.ReadConfig("playbackMessages");

	// Bismo.events.Discord.on('ready', async Client => {
	// 	if (playbackMessages!=undefined) {
	// 		for (var i = 0; i<playbackMessages.length; i++) {
	// 			try {
	// 				if (playbackMessages[i]!=undefined) {
	// 					var chan = await Client.channels.fetch(playbackMessages[i].channelID)
	// 					if (chan!=undefined) {
	// 						var msg = await chan.messages.fetch(playbackMessages[i].msgID)//.then(msg=>{
	// 						msg.delete();
	// 					}
	// 				}
	// 			} catch (a) {} // if the message doesn't exist...				
	// 		}
	// 	}
	// 	playbackMessages = [];
	// 	Bismo.WriteConfig(playbackMessages, undefined, "playbackMessages");
	// });


	// Bismo.RegisterCommand("que", mainHandler, "Manage the song queue.", "Usage:\n"
	// 	+ "`!que [option]`\n"
	// 	+ "\n"
	// 	+ "Options:\n"
	// 	+ "	-	`clear`: Clears the queue\n"
	// 	+ "	-	`view`: View the queue\n"
	// 	+ "	-	`skip`: Skip the current song\n"
	// 	+ "	-	`vol`: Set the output volume % (0-200, 100 is normal)"
	// 	+ "	-	`loop [song | queue]`:	Toggles repeat\n"
	// 	+ "	-	`remove <index | title>`: Removes the song at <index> or with <title>\n"
	// );

	// Bismo.RegisterCommand("q", mainHandler, "Manage the song queue.", "Usage:\n"
	// 	+ "`!que [option]`\n"
	// 	+ "\n"
	// 	+ "Options:\n"
	// 	+ "	-	`clear`: Clears the queue\n"
	// 	+ "	-	`view`: View the queue\n"
	// 	+ "	-	`skip`: Skip the current song\n"
	// 	+ "	-	`vol`: Set the output volume % (0-200, 100 is normal)"
	// 	+ "	-	`loop [song | queue]`:	Toggles repeat\n"
	// 	+ "	-	`remove <index | title>`: Removes the song at <index> or with <title>\n"
	// );

	Bismo.RegisterCommand("q", mainHandler, {
		description: "Manage the voice channel audio queue.",
		helpMessage: "Usage:\n"
		+ "`!que [option]`\n"
		+ "\n"
		+ "Options:\n"
		+ "	-	`clear`: Clears the queue\n"
		+ "	-	`view`: View the queue\n"
		+ "	-	`skip`: Skip the current song\n"
		+ "	-	`vol`: Set the output volume % (0-200, 100 is normal)"
		+ "	-	`loop [song | queue]`:	Toggles repeat\n"
		+ "	-	`remove <index | title>`: Removes the song at <index> or with <title>\n",
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
		date: "02/28/2021",
		version: "1"
	},
	api: Plugin
}