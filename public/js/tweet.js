const tweets = document.querySelectorAll('.tweet');
for (const tw of tweets) {
	tw.addEventListener('click', e => {
		if (e.target.className === 'tweet-media') {
			tw.classList.add('fullscreen');
		}
	});

	const fullscreenClose = tw.querySelector('.tweet-media-fullscreen-close');
	if (fullscreenClose) {
		fullscreenClose.addEventListener('click', e => {
			tw.classList.remove('fullscreen');
		});
	}
}


const actionButtons = document.querySelectorAll('.tweet-action');

async function actionButtonListener({target}) {
	const tweet = target.getAttribute('tweet');
	const action = target.getAttribute('action');
	const undo = target.getAttribute('undo') === 'true';
	let res;
	if (action === 'like') {
		res = await fetch(`/api/tweets/${undo ? 'unlike' : 'like'}/${tweet}`);
		res = await res.json();
		const targets = document.querySelectorAll(`.tweet-action.like[tweet='${tweet}']`);
		for (const target of targets) {
			target.querySelector('i').classList.toggle('fa-solid');
			target.querySelector('i').classList.toggle('fa-regular');
			target.setAttribute('undo', !undo);
			target.querySelector('.count').innerText = res.count;
			target.classList.toggle('active');
		}

	}
	if (action === 'retweet') {
		res = await fetch(`/api/tweets/${undo ? 'unretweet' : 'retweet'}/${tweet}`);
		res = await res.json();
		const targets = document.querySelectorAll(`.tweet-action.retweet[tweet='${tweet}']`);
		for (const target of targets) {
			target.setAttribute('undo', !undo);
			target.querySelector('.count').innerText = res.count;
			target.classList.toggle('active');
		}
		if (undo)
			document.querySelector(`.retweet#${tweet}`).remove();
		else {
			const base = document.querySelector(`.tweet#${tweet}`);
			const clone = base.cloneNode(true);
			clone.classList.add('retweet');
			const ref = clone.querySelector('.ref') || document.createElement('a');
			ref.href = `/profile/${USER.username}`;
			ref.className = 'ref';
			ref.innerHTML = `<i class="fa-solid fa-retweet"></i><span>${USER.displayName || `@${USER.username}`} a retweeté</span>`;
			clone.querySelector('.right').insertAdjacentElement('afterbegin', ref);
			clone.querySelector('.tweet-action.delete')?.addEventListener('click', actionButtonListener);
			clone.querySelector('.tweet-action.reply').addEventListener('click', actionButtonListener);
			clone.querySelector('.tweet-action.retweet').addEventListener('click', actionButtonListener);
			clone.querySelector('.tweet-action.like').addEventListener('click', actionButtonListener);
			document.querySelector('#home-timeline')?.insertAdjacentElement('afterbegin', clone);
		}
	}

	if (action === 'delete') {
		if (confirm('Supprimer le tweet ?')) {
			let res = await fetch(`/api/tweets/delete/${tweet}`);
			res = await res.json();
			document.getElementById(tweet).remove();
		}
	}
}

for (const btn of actionButtons) {
	btn.addEventListener('click', actionButtonListener);
}

const tweetTimes = document.querySelectorAll('.tweet-time');

	for (const elm of tweetTimes) {
		const date = new Date(elm.getAttribute('date'));
		moment.locale('fr');
		elm.innerText = '• ' + moment(date).fromNow().replace('il y a', '');
		elm.setAttribute('title', moment(date).format('LLLL'));
	}