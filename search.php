<?php
// Keep old bookmarks usable after removal of the database search page.
header('Location: builder.php', true, 302);
exit;
