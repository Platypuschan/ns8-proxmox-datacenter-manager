/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * LD_PRELOAD shim for Proxmox Datacenter Manager in a container.
 *
 * Container runtimes bind-mount /etc/resolv.conf, /etc/hosts and /etc/hostname.
 * PDM replaces them with the atomic write-then-rename pattern, and rename(2)
 * onto a mount point fails with EBUSY ("Atomic rename failed ... Device or
 * resource busy"). This shim retries such a rename as an in-place copy of the
 * new content, which a bind mount allows, and removes the temporary file.
 *
 * resolv.conf is additionally copied to $NS8_PERSIST_DIR/ns8-resolv.conf so the
 * entrypoint can restore the DNS settings entered in the web interface.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static const char *const bound[] = {"/etc/resolv.conf", "/etc/hosts", "/etc/hostname", NULL};

static int is_bound(const char *path)
{
    for (int i = 0; bound[i]; i++)
        if (strcmp(path, bound[i]) == 0)
            return 1;
    return 0;
}

/* Copy src to dst in place (truncate + write), keeping dst's inode. */
static int copy_in_place(const char *src, const char *dst)
{
    int in = open(src, O_RDONLY | O_CLOEXEC);
    if (in < 0)
        return -1;
    int out = open(dst, O_WRONLY | O_TRUNC | O_CLOEXEC);
    if (out < 0) {
        int e = errno;
        close(in);
        errno = e;
        return -1;
    }
    char buf[4096];
    ssize_t n;
    int rc = 0;
    while ((n = read(in, buf, sizeof buf)) > 0) {
        char *p = buf;
        while (n > 0) {
            ssize_t w = write(out, p, (size_t)n);
            if (w < 0) {
                rc = -1;
                goto done;
            }
            p += w;
            n -= w;
        }
    }
    if (n < 0)
        rc = -1;
done:
    close(in);
    close(out);
    return rc;
}

static void persist(const char *path)
{
    const char *dir = getenv("NS8_PERSIST_DIR");
    char target[PATH_MAX];
    if (!dir || strcmp(path, "/etc/resolv.conf") != 0)
        return;
    if (snprintf(target, sizeof target, "%s/ns8-resolv.conf", dir) >= (int)sizeof target)
        return;
    int fd = open(target, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd >= 0)
        close(fd);
    (void)copy_in_place(path, target);
}

/* Returns 1 if the rename was handled here (result in *ret). */
static int fallback(int newdirfd, const char *oldpath, int olddirfd, const char *newpath, int *ret)
{
    char src[PATH_MAX];
    if (!newpath || newpath[0] != '/' || !is_bound(newpath))
        return 0;
    if (errno != EBUSY && errno != EXDEV)
        return 0;
    if (oldpath[0] == '/') {
        snprintf(src, sizeof src, "%s", oldpath);
    } else if (olddirfd == AT_FDCWD) {
        if (!getcwd(src, sizeof src))
            return 0;
        size_t l = strlen(src);
        snprintf(src + l, sizeof src - l, "/%s", oldpath);
    } else {
        char link[64], base[PATH_MAX];
        snprintf(link, sizeof link, "/proc/self/fd/%d", olddirfd);
        ssize_t n = readlink(link, base, sizeof base - 1);
        if (n < 0)
            return 0;
        base[n] = 0;
        snprintf(src, sizeof src, "%s/%s", base, oldpath);
    }
    (void)newdirfd;
    if (copy_in_place(src, newpath) != 0) {
        *ret = -1;
        return 1;
    }
    unlink(src);
    persist(newpath);
    *ret = 0;
    return 1;
}

int rename(const char *oldpath, const char *newpath)
{
    static int (*real)(const char *, const char *);
    if (!real)
        real = dlsym(RTLD_NEXT, "rename");
    int r = real(oldpath, newpath), ret;
    if (r != 0 && fallback(AT_FDCWD, oldpath, AT_FDCWD, newpath, &ret))
        return ret;
    return r;
}

int renameat(int olddirfd, const char *oldpath, int newdirfd, const char *newpath)
{
    static int (*real)(int, const char *, int, const char *);
    if (!real)
        real = dlsym(RTLD_NEXT, "renameat");
    int r = real(olddirfd, oldpath, newdirfd, newpath), ret;
    if (r != 0 && newdirfd == AT_FDCWD && fallback(newdirfd, oldpath, olddirfd, newpath, &ret))
        return ret;
    return r;
}

int renameat2(int olddirfd, const char *oldpath, int newdirfd, const char *newpath, unsigned int flags)
{
    static int (*real)(int, const char *, int, const char *, unsigned int);
    if (!real)
        real = dlsym(RTLD_NEXT, "renameat2");
    int r = real(olddirfd, oldpath, newdirfd, newpath, flags), ret;
    if (r != 0 && flags == 0 && newdirfd == AT_FDCWD && fallback(newdirfd, oldpath, olddirfd, newpath, &ret))
        return ret;
    return r;
}
