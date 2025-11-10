
## Second Round of UX Testing
- PBSWI Projects folder doesn't need to be hard coded given the new logic for generating weekly updates. 
- Numerous notes from first round not addressed, please review carefully and continue development on fixes. 
- Update language to "project updates" instead of 1 on 1. 
- Direct links to install dependencies should appear in helper text for "Check Dependencies" button, and add the text "make sure each plug-in is also active."
- The weekly update notes should just all appear in the INBOX folder, no need to set a path for that. Add text explaining that behavior to the user. 
- Kanban board file helper text should indicate that if there isn't a kanban board, one will be created in the INBOX folder when "Agenda Generation" is checked to be active. The path can be changed if the user wishes. 
	- [Kanban](obsidian://show-plugin?id=obsidian-kanban)
	- [Tasks](obsidian://show-plugin?id=obsidian-tasks-plugin)
	- [Templater](obsidian://show-plugin?id=templater-obsidian)




## Initial UX Testing
- I forgot how essential the project dashboard is to the 1 on 1 workflow, let's create a template for that in the templates folder that strips out all my cards but otherwise preserves the structure I have on my board. 
- The button for the setup wizard and for checking dependencies should be at the top of the config page. If possible, the links to dependencies should link directly to where you can install the plug-ins on the obsidian community add-on store. 
- Agenda generation for project updates should be disabled by default.
- Make it clear that the kanban board is required for project updates to work properly. 
- Change all references from "weekly 1 on 1" to "project updates"
- The user designates which folder within PROJECTS they want a regular "project update" agenda for, along with the day, time and frequency. 
- No need to hardcode PBSWI into the plug-in, the option should be for any project. 
- The custom property should be "PARA" and the user doesn't need to be able to change it, this is a PARA app. 
- "Migrate old tags" isn't relevant to new users so let's get rid of that and mark it as a problem unique to the legacy version of the plugin. 
- No need to set the "Project update" location, those should just be generated as "UPDATE — PROJECT NAME" in the Inbox folder. If the note doesn't exist, create a new one on the schedule the user sets, if there already is one, add to it for that week. 
- The default PARA folders should be
	- 0 - INBOX
	- 1 - PROJECTS
	- 2 - AREAS 
	- 3 - RESOURCES
	- 4 - ARCHIVE
- We should add some basic resources about PARA from here https://fortelabs.com/blog/para/. Add those to your project knowledge, and also create a single note in RESOURCES that summarizes the system with links to outside references.
- Similarly, the plug-in config screen needs some brief descriptions of how everything works. Take a first run at it, but make it straightforward for me to find the file where I can make further revisions to the copy that appears in that space. 