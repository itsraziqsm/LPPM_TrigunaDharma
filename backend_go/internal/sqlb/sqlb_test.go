package sqlb

import "testing"

func TestBuilders(t *testing.T) {
	cases := []struct{ got, want string }{
		{Insert("User", []string{"email", "name"}), "INSERT INTO `User` (`email`,`name`) VALUES (?,?)"},
		{InsertIgnoreRows("ReviewerTugasan", []string{"proposalId", "reviewerId", "createdAt"}, 2),
			"INSERT IGNORE INTO `ReviewerTugasan` (`proposalId`,`reviewerId`,`createdAt`) VALUES (?,?,?),(?,?,?)"},
		{UpdateByID("Periode", []string{"nama", "updatedAt"}), "UPDATE `Periode` SET `nama` = ?, `updatedAt` = ? WHERE `id` = ?"},
		{In("DELETE FROM `Notification` WHERE `refId` IN (?*)", 3), "DELETE FROM `Notification` WHERE `refId` IN (?,?,?)"},
		{In("SELECT 1 WHERE a IN (?*) OR b IN (?*)", 2), "SELECT 1 WHERE a IN (?,?) OR b IN (?,?)"},
		{In("SELECT 1 WHERE a IN (?*)", 0), "SELECT 1 WHERE a IN (NULL)"},
		{QuoteAny("a`b"), "`a``b`"},
		{SelectAll("_prisma_migrations"), "SELECT * FROM `_prisma_migrations`"},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("got  %s\nwant %s", c.got, c.want)
		}
	}
}

func TestRejectsUnsafeIdentifiers(t *testing.T) {
	bad := []func(){
		func() { Ident("nama`; DROP TABLE User; --") },
		func() { Ident("") },
		func() { Ident("1abc") },
		func() { Insert("User", []string{"email", "name = 1"}) },
		func() { UpdateByID("User", []string{"x` = 1, `role"}) },
		func() { UpdateByID("User", nil) },
		func() { InsertIgnoreRows("T", []string{"a"}, 0) },
		func() { In("SELECT 1 WHERE a IN (?)", 2) },
	}
	for i, f := range bad {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("kasus %d: seharusnya panic", i)
				}
			}()
			f()
		}()
	}
}
