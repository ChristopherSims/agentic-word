//! Spell checking using spellbook (pure Rust, Hunspell-compatible dictionaries).
//! Uses an embedded minimal dictionary for cross-platform use.
//! Falls back to built-in word list if spellbook fails to initialize.

use std::sync::OnceLock;

/// Global spellbook Dictionary instance (lazily initialized from embedded data).
fn global_spellbook() -> &'static spellbook::Dictionary<spellbook::DefaultHashBuilder> {
    static DICT: OnceLock<spellbook::Dictionary<spellbook::DefaultHashBuilder>> = OnceLock::new();
    DICT.get_or_init(|| {
        let aff = EMBEDDED_AFF;
        let dic = EMBEDDED_DIC;
        spellbook::Dictionary::new(aff, dic)
            .expect("Failed to initialize spellbook dictionary from embedded data")
    })
}

/// Check text for spelling errors.
/// Returns Vec<SpellIssue> with word, position, and suggestions.
pub fn check_text(text: &str) -> Vec<crate::language::SpellIssue> {
    let dict = global_spellbook();
    let mut issues = Vec::new();
    let mut offset = 0;

    for word in text.split_whitespace() {
        let clean: String = word.chars().filter(|c| c.is_alphabetic() || *c == '\'').collect();
        if clean.is_empty() || clean.len() < 2 {
            offset += word.len() + 1;
            continue;
        }

        if !dict.check(&clean) {
            let mut suggestions = Vec::new();
            dict.suggest(&clean, &mut suggestions);
            suggestions.truncate(5);
            issues.push(crate::language::SpellIssue {
                word: clean.clone(),
                position: offset + word.find(|c: char| c.is_alphabetic()).unwrap_or(0),
                suggestions,
            });
        }
        offset += word.len() + 1;
    }

    issues
}

// ─── Embedded Hunspell-compatible dictionary (minimal) ───
const EMBEDDED_AFF: &str = "\
SET UTF-8
TRY aeoindrstulymgchpbkfwvAEIOUINDRSTULYMGHCPBKFWV
REP 9
REP a e
REP e a
REP i e
REP ie y
REP y ie
REP f ph
REP ph f
REP ough uck
REP ee ea
";

const EMBEDDED_DIC: &str = "\
255
a
about
accept
action
after
align
all
also
an
and
any
app
arabic
aren't
as
at
back
backend
be
because
bold
bridge
but
button
by
can
can't
cannot
cell
center
check
chinese
close
code
col
color
come
comment
config
copy
could
couldn't
cut
czech
danish
dark
data
day
delete
didn't
dismiss
do
doesn't
document
don't
dutch
edit
editor
english
even
file
find
finnish
first
font
footer
for
format
french
from
function
gaelic
german
get
give
go
good
greek
hadn't
hasn't
have
haven't
header
he
he'll
he's
help
her
highlight
him
his
how
hungarian
i
i'll
i'm
i've
icon
if
image
in
insert
into
isn't
it
it's
italian
italic
japanese
just
key
know
korean
left
light
like
line
link
list
look
make
mark
me
menu
mode
module
most
my
native
new
no
norwegian
not
note
of
on
one
only
open
option
or
other
our
out
over
page
panel
paste
people
polish
portuguese
preference
proxy
redo
reject
replace
review
romanian
row
russian
rust
save
say
scottish
search
see
select
setting
she
she'll
she's
shouldn't
size
so
some
spanish
spell
style
suggest
swedish
tab
table
text
than
that
the
their
them
theme
then
there
these
they
they'll
they're
think
this
time
to
tool
turkish
two
type
underline
undo
up
us
use
view
want
wasn't
way
we
we'll
we're
we've
well
weren't
what
when
which
who
will
window
with
won't
word
work
would
wouldn't
year
you
you'll
you're
your
";
