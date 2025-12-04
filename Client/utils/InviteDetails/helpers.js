export function getStartTimeMs(post) {
    if (!post) return null;
    const d = post.details || {};
    const raw =
        d.dateTime ||
        post.dateTime ||
        post.sortDate ||
        post.createdAt;

    if (!raw) return null;

    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'number') return raw;

    if (typeof raw === 'string') {
        const t = Date.parse(raw);
        return Number.isFinite(t) ? t : null;
    }

    return null;
}

export function formatClockLabel(post) {
    if (!post) return '';
    const d = post.details || {};
    const raw =
        d.dateTime ||
        post.dateTime ||
        post.sortDate ||
        post.createdAt;

    if (!raw) return '';

    const dt = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';

    return dt.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function formatFullDateLabel(post) {
    if (!post) return '';
    const d = post.details || {};
    const raw =
        d.dateTime ||
        post.dateTime ||
        post.sortDate ||
        post.createdAt;

    if (!raw) return '';

    const dt = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';

    const datePart = dt.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
    const timePart = dt.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });

    return `${datePart} · ${timePart}`;
}

/* ---------------------- viewer status / attendance ---------------------- */

export function computeViewerStatus(content, currentUserId) {
    if (!content || !currentUserId) return null;
    const uid = String(currentUserId);

    const details = content.details || {};
    const recipients = Array.isArray(details.recipients)
        ? details.recipients
        : [];

    for (const r of recipients) {
        if (!r) continue;

        const rid =
            r.userId ||
            r._id ||
            r.id ||
            (r.user && (r.user._id || r.user.id));

        if (!rid) continue;
        if (String(rid) !== uid) continue;

        const status = String(r.status || '').toLowerCase();
        if (!status) return 'invited'; // pending -> user-friendly label
        if (status === 'accepted') return 'going';
        if (status === 'declined') return 'declined';
        return status;
    }

    const owner = content.owner || {};
    const ownerId = owner.id || owner._id || owner.userId;
    if (ownerId && String(ownerId) === uid) {
        return 'hosting';
    }

    return null;
}

export function computeAttendance(content) {
    const details = content?.details || {};
    const recipients = Array.isArray(details.recipients)
        ? details.recipients
        : [];

    const toPerson = (r) => {
        const u = r.user || {};
        const name =
            u.fullName ||
            [u.firstName, u.lastName].filter(Boolean).join(' ') ||
            'Guest';
        const avatarUrl = u.profilePicUrl || u.avatarUrl || null;
        const id =
            r.userId ||
            r._id ||
            r.id ||
            u.id ||
            u._id ||
            name;

        return {
            id: String(id),
            name,
            avatarUrl,
        };
    };

    let goingCount = 0;
    let pendingCount = 0;
    let declinedCount = 0;

    const goingPeople = [];
    const pendingPeople = [];
    const declinedPeople = [];
    const preview = [];

    for (const r of recipients) {
        if (!r) continue;
        const status = String(r.status || '').toLowerCase();
        const person = toPerson(r);

        if (status === 'accepted') {
            goingCount += 1;
            goingPeople.push(person);
        } else if (status === 'declined') {
            declinedCount += 1;
            declinedPeople.push(person);
        } else {
            pendingCount += 1;
            pendingPeople.push(person);
        }

        if (preview.length < 5) {
            preview.push({
                ...person,
                status,
            });
        }
    }

    const total = recipients.length;

    return {
        goingCount,
        pendingCount,
        declinedCount,
        total,
        preview,
        goingPeople,
        pendingPeople,
        declinedPeople,
    };
}

export function viewerStatusLabel(viewerStatus) {
    switch (viewerStatus) {
        case 'hosting':
            return "You're hosting this";
        case 'going':
            return "You're going";
        case 'invited':
        case 'pending':
            return "You're invited";
        case 'declined':
            return "You declined this";
        default:
            return null;
    }
}

export function privacyLabel(post) {
    const raw = (post?.privacy || '').toLowerCase();
    if (raw === 'public') return 'Public event';
    if (raw === 'friends') return 'Friends only';
    if (raw === 'private') return 'Private event';
    return null;
}
