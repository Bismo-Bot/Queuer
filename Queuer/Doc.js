/*

	Song object: {
		id: 0,			// The song ID in the queue. This is not necessarily the track position in the queue (unless shuffle is disabled).
		oID: 0, 		// This is the above ID (used for unshuffling)
		loop: false, 	// If `true` we loop this song

		title: "Never Gonna Give You Up",		// Title of the song
		addedBy: "<discord userID>",			// The ID of the user that added this song
		addedByUsername: "<username>",			// The username of the user ""
		timeStamp: "3:32",						// Needed
		packageName: "com.watsuprico.youtube",	// The plugin that added this to the queue


		// Optional functions (try to make these functions as slim as possible, potentially just a wrapper to the Plugin's API)
		play: function(queue),			// Begin playing the song. This should play the song from the beginning; think of this as startSong()
		
		seek: function(queue, time),	// Seek playback to <time> (which is given in seconds)


		// If the plugin needs to store information relevant to playback, such as URL for example, then it can store that data in the following object:
		persistentData: {
			url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
		}

		// When we sterilize this song for saving it, we ONLY record the meta-data and persistentData. All functions and additional data will NOT be stored.

	}

	Queue object: {
		#guildID: The guild we're playing in
		#voiceConnection: The VoiceConnection object
		#playbackMessageID: The ID of the current playback message
		#songs: Array of song objects
		#volume: Playback volume
		#paused: Whether the queue is currently being played
		#currentSong: Currently playing song ID
		#textChannel: The text channel we're subscribed to
		#voiceChannel: The voice channel we're currently playing in
		#id: The ID of the queue (typically the guildID + a random string)

		
		#UpdatePlaybackMessage(): Updates the playback message with the current playback status


		Play(): 			Starts playing the queue (or resume)
		PlaySong(song): 	Starts playing (streaming) a song

		Pause([song | ID]): Pauses the queue (if song | ID is provided, the queue is only paused if that song/ID is playing)
		Skip([song | ID]): 	Skips the current song (if song | ID is provided, the song is skipped on if that song/ID is playing)

		Add(song, options):	Adds `song` to the current queue.
			Options:
				index: (number) add the song to this position in the queue
				nextInQueue: (boolean) add the song to the queue but places it to play next
		Remove(song): 		Removes `song` from the playback queue (skips if playing)

		Stop(): 			Stops playing a queue (destroys the queue)
		Destroy(): 			Destroys the queue


		Save(name, authorID[, options]): Save a queue to disk. Wrapper for Queuer.SaveQueue(this, **)
			name: Name of the saved queue
			authorID: The person saving this queue (their Discord user ID)
			Options:
				saveLocation: Save under what? guild, guildPersonal, personal (default: personal)
				guildID: The guild we're saving this to (default: the guild the queue is currently playing to (or the userID if personal))

	}


	
	Queuer 2 API:
		Types:
			queueData: {
				textChannel: Discord.TextChannel	| The text channel "controlling" the queue (if channel locked. Regardless, this is where queue status is sent)
				voiceChanne: Discord.VoiceChannel	| The voice channel the queue plays in
				song?: Queuer.Song 					| First song in the queue, optional
			}	

		CreateQueue(ID, /queueData/): Creates a new queue with ID #ID. queueData is an object that contains:
			
		AddSong(queueID, song[, /queueData/]): Adds a song to a queue with ID queueID, (if no queue is active, creates one using provided queueData)

		GetQueueObject(queueID): Returns the Queue object of a queue with ID queueID.


	Queuer:


		DeleteSavedQueue(name, authorID)
		SaveQueue(queue, name, authorID)
		LoadQueue(name, authorID, options)
			Options:
				guild: (boolean) In guild?
				guildID: The ID of the guild (or if personal, userID) where the guild will be played
				voiceChanel: The ID of the voice channel





		TODO: {
			pin a message on first join, this pin message will update every time the song changes so the channel can easily view the current song

			react to messages where possible

			add collectors to make commands easier

			pause, play, seek
		}


		Queue acts as the middleman between a sea of 'play' commands and different addons that pull music from various sources.
	
		Song object: {
			id: 0,			// The song ID in the queue. This is not necessarily the track position in the queue (unless shuffle is disabled).
			loop: false, 	// If `true` we loop this song

			title: "Never Gonna Give You Up",		// Title of the song
			addedBy: "<discord userID>",			// The ID of the user that added this song
			addedByUsername: "<username>",			// The username of the user ""
			timeStamp: "3:32",						// Needed
			packageName: "com.watsuprico.youtube",	// The plugin that added this to the queue


			// Optional functions (try to make these functions as slim as possible, potentially just a wrapper to the Plugin's API)
			play: function(queue),			// Begin playing the song. This should play the song from the beginning; think of this as startSong()
			
			seek: function(queue, time),	// Seek playback to <time> (which is given in seconds)


			// If the plugin needs to store information relevant to playback, such as URL for example, then it can store that data in the following object:
			persistentData: {
				url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
			}

			// When we sterilize this song for saving it, we ONLY record the meta-data and persistentData. All functions and additional data will NOT be stored.

		}

		When loading a song (from being saved) we call `songObj = Plugin.setSong(songObj);`
		It is up to the plugin to setup the song data as it should be (add the play, seek etc function)

		Queuer reactions (responses):
			🖖: Voice channel disconnected,
				"Goodbye"
			
			⭕: Queue created, joined voice channel 
				"Hello!"
	
			⁉️: Illegal operation: attempt to modify non-existent queue.
				"What?" / No queue active"

			👌: Operation completed successful.
				"Okay!" / "Done"
			
			🙅‍X: Disabled X, where X is an emoji (for example, 🙅‍🔁 means 'disabled repeat' or 'NO repeat' or 'repeat off')

			🔂: Song on repeat
			🔁: Queue on repeat
			🔀: Shuffle active
			▶️:  Playing
			⏸️: Paused
			⏭️: Skipped




		Queue commands (alias: q, queuer) {
			-q stop|clear|end|leave: Clears the queue and makes the bot leave the voice channel.
			
			-q view|queue [fromIndex]: Displays the current queue (up to 5 items a time). To view beyond these 5 items, specify a 'fromIndex' to display the tracks after that song ID. (!q view shows 0-4, !q view 5 shows 5-10)
			
			-q loop|repeat [song|queue]: If song|queue is not specified, this toggles the repeat mode.
				No loop -> loop queue -> loop track -> no loop -> ...
				You can specify if you want to manually enable repeat for the track or song by specifying that with something like !q loop song
			
			- q remove|rm|del|delete <startID> <endID>: Removes a song from index <startID> to <endID>
			- q remove|rm|del|delete <title>: Remove the song with the title <title>. Exact matches only (not case sensitive).
			- q remove|rm|del|delete next|n: Remove the next song
			- q remove|rm|del|delete current|cur|c: Removes the current song (and goes to the next song)
			- q remove|rm|del|delete previous|prev|p: Removes the previous song


			- q skip|next: Go to the next song. If playing the last song in the queue, we actually loop over to the beginning.
				To do this we temporally enable queue loop, issue the next command, and then disable the set the loop back to whatever it was

			- q volume|vol <percentage %>: Changes the playback volume to <percentage>% (200-0)

			- q shuffle: Toggle shuffle mode. Once enabled, we move the current song to the beginning and randomly sort the queue.
				You can then disable shuffle and everything will go back to how it was before. (idea was to mimic Spotify shuffling)

			- q save name: Save the current queue (as private)
			- q save save-p|save-private <name>: Save queue to author's private storage (as <name>)
			- q save save-g|save-guild <name>: Save queue to guild (as <name>)
				If personal is specified as the save location then only the author can retrieve the queue. The queue can be retrieved in any guild
				If guild is specified as the save location, then anyone in the guild can retrieve the queue, but ONLY in that guild.
				
				The ID is a MD5 hash of the following information:
					name: name of the saved queue... (all locations)
					queueID: Either a guildID or userID (guild & guild-private use guildID, private uses userID)
					authorID: The person who saved this. (guild-private)

				We save queues like this: savedQueues = {
					[ID] = savedQueue;
				}
				When saving the queue, we strip all song data except: {
					id,
					title,
					addedBy,
					timeStamp,
					packageName,
					persistentData,
				}
			
			-q (load | loadq | lq) name: Load a song by name
				We first check the for a private guild queue of that name,
				then personal queues,
				and then finally public guild queues
				guild (private) -> personal -> guild
				This allows users to save custom queues per-guild by the same name as a private queue. (So making a custom version of the queue for a guild).

		}


		Groovy commands:
			Need to add:
				playlists

			X-play [link | title]
			X-play <file>
			-join
			X-queue: View
			X-next
			X-back
			X-clear: Queue
			x-jump: GOTO
			-move
			X-loop track|queue|off
			-lyrics [query]
			X-pause
			X-resume
			X-remove [title | position]
			X-remove range [start] [end]
			X-disconnect
			X-shuffle
			X-song [song]: Info about song
			-24/7
			X-volume [vol]
			-seek
			-fastfoward: Seek, but relative
			-rewind
			-search: Display search results
			X-stop


			-bass boost [amount]
			-speed [speed]
			-pitch [%]
			-nightcore
			-vaporwave


*/