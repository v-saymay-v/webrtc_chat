# Makefile for libasjclass.a in ASJ Base Class(ÆüËÜ¸ì)
# $Id: Makefile,v 1.14 2012/04/18 01:12:38 hori Exp $

#-----------------------------------------------------------------------------#
GCC	?= gcc
AR	= ar
RM	= rm -f
RL	?= ranlib

prefix	= /usr/local
incdir	= $(prefix)/include
srcdir	= .

.ifdef DEBUG
.ifdef PROFILE
DBG	?= -D_DEBUG -pg
.else
DBG	?= -D_DEBUG -g
.endif
.else
DBG	?= -O3
.endif
DEFS	= -D_$(DB)

LIBINCS	= -I$(incdir) -I$(srcdir) -I../libnkf
CFLAGS	+= $(LIBINCS) $(DBG) $(DEFS) -Wall -fstack-protector

PROGRAM	= libwebsocket.a
SRCS	= base64-decode.c client-handshake.c client-parser.c client.c daemonize.c \
		  extension-deflate-frame.c extension-deflate-stream.c extension.c \
		  getifaddrs.c handshake.c libwebsockets.c output.c parsers.c \
		  server-handshake.c server.c sha-1.c
OBJS	= $(SRCS:.c=.o)
HEADER	= $(SRCS:.c=.h)
#-----------------------------------------------------------------------------#

.SUFFIXES: .c .o
.c.o:
	$(GCC) $(CFLAGS) -c -o $@ $<

$(PROGRAM): $(OBJS)
	$(AR) r $(PROGRAM) $(OBJS)
	$(RL) $(PROGRAM)

default: $(PROGRAM)
all: clean $(PROGRAM)

clean:
	$(RM) $(OBJS)
	$(RM) $(PROGRAM)
depend:
	makedepend -Y /usr/include -Y /usr/local/include -- $(SRCS)

sync: default

install:
instopt:

# DO NOT DELETE
